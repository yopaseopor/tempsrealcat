#!/usr/bin/env python3
"""
GTFS Data Analysis and Completion Script

This script analyzes GTFS files to identify:
1. Routes without stops or times
2. Stops without times
3. Missing stop_times entries
4. Generates missing data where possible
"""

import csv
import sys
from collections import defaultdict, Counter
import os

def load_csv(filename):
    """Load CSV file into list of dicts"""
    data = []
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                data.append(row)
    except FileNotFoundError:
        print(f"Warning: {filename} not found")
    except Exception as e:
        print(f"Error loading {filename}: {e}")
    return data

def analyze_gtfs_dataset(gtfs_path):
    """Analyze a single GTFS dataset"""
    print(f"\n=== Analyzing GTFS dataset: {gtfs_path} ===")

    # Load all GTFS files
    routes = load_csv(os.path.join(gtfs_path, 'routes.txt'))
    trips = load_csv(os.path.join(gtfs_path, 'trips.txt'))
    stops = load_csv(os.path.join(gtfs_path, 'stops.txt'))
    stop_times = load_csv(os.path.join(gtfs_path, 'stop_times.txt'))

    print(f"Loaded {len(routes)} routes, {len(trips)} trips, {len(stops)} stops, {len(stop_times)} stop times")

    # Create lookup dictionaries
    route_ids = {r['route_id'] for r in routes}
    trip_ids = {t['trip_id'] for t in trips}
    stop_ids = {s['stop_id'] for s in stops}

    # Map relationships
    route_to_trips = defaultdict(set)
    trip_to_stops = defaultdict(set)
    stop_to_trips = defaultdict(set)

    for trip in trips:
        route_to_trips[trip['route_id']].add(trip['trip_id'])

    for st in stop_times:
        trip_to_stops[st['trip_id']].add(st['stop_id'])
        stop_to_trips[st['stop_id']].add(st['trip_id'])

    # Analysis
    issues = {
        'routes_without_trips': [],
        'routes_without_stops': [],
        'routes_without_times': [],
        'trips_without_stops': [],
        'trips_without_times': [],
        'stops_without_trips': [],
        'stops_without_times': [],
        'invalid_route_refs': [],
        'invalid_stop_refs': [],
        'invalid_trip_refs': []
    }

    # Check routes
    for route in routes:
        route_id = route['route_id']
        trips_for_route = route_to_trips[route_id]

        if not trips_for_route:
            issues['routes_without_trips'].append(route_id)
            issues['routes_without_stops'].append(route_id)
            issues['routes_without_times'].append(route_id)
        else:
            # Check if any trip has stops/times
            has_stops = False
            has_times = False
            for trip_id in trips_for_route:
                if trip_id in trip_to_stops:
                    has_stops = True
                    has_times = True  # stop_times implies times
                    break

            if not has_stops:
                issues['routes_without_stops'].append(route_id)
            if not has_times:
                issues['routes_without_times'].append(route_id)

    # Check trips
    for trip in trips:
        trip_id = trip['trip_id']
        stops_for_trip = trip_to_stops[trip_id]

        if not stops_for_trip:
            issues['trips_without_stops'].append(trip_id)
            issues['trips_without_times'].append(trip_id)

        # Check invalid references
        if trip['route_id'] not in route_ids:
            issues['invalid_route_refs'].append((trip_id, trip['route_id']))

    # Check stops
    for stop in stops:
        stop_id = stop['stop_id']
        trips_for_stop = stop_to_trips[stop_id]

        if not trips_for_stop:
            issues['stops_without_trips'].append(stop_id)
            issues['stops_without_times'].append(stop_id)

    # Check stop_times references
    for st in stop_times:
        if st['trip_id'] not in trip_ids:
            issues['invalid_trip_refs'].append((st['trip_id'], st['stop_id']))
        if st['stop_id'] not in stop_ids:
            issues['invalid_stop_refs'].append((st['trip_id'], st['stop_id']))

    # Print summary
    print("\n=== ISSUES FOUND ===")
    for issue_type, items in issues.items():
        if items:
            print(f"{issue_type}: {len(items)}")
            if len(items) <= 10:  # Show first 10
                for item in items[:10]:
                    print(f"  - {item}")
                if len(items) > 10:
                    print(f"  ... and {len(items) - 10} more")
        else:
            print(f"{issue_type}: 0")

    return issues, {
        'routes': routes,
        'trips': trips,
        'stops': stops,
        'stop_times': stop_times,
        'route_ids': route_ids,
        'trip_ids': trip_ids,
        'stop_ids': stop_ids,
        'route_to_trips': route_to_trips,
        'trip_to_stops': trip_to_stops,
        'stop_to_trips': stop_to_trips
    }

def main():
    """Main analysis function"""
    gtfs_datasets = [
        'docs/assets/gtfs/amb_bus',
        'docs/assets/gtfs/gencat_bus_interurba'
    ]

    all_issues = {}
    all_data = {}

    for dataset in gtfs_datasets:
        if os.path.exists(dataset):
            issues, data = analyze_gtfs_dataset(dataset)
            all_issues[dataset] = issues
            all_data[dataset] = data
        else:
            print(f"Dataset {dataset} not found")

    print("\n=== OVERALL SUMMARY ===")
    for dataset, issues in all_issues.items():
        dataset_name = os.path.basename(dataset)
        print(f"\n{dataset_name}:")
        total_issues = sum(len(items) for items in issues.values())
        print(f"  Total issues: {total_issues}")

        critical_issues = len(issues['routes_without_times']) + len(issues['stops_without_times'])
        print(f"  Critical issues (routes/stops without times): {critical_issues}")

if __name__ == '__main__':
    main()
