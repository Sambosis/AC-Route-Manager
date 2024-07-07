import sys
import pandas as pd
import sqlite3
import os
import requests
from urllib.parse import quote_plus
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
import numpy as np

# Constants
EARTH_RADIUS_KM = 6371  # Earth's radius in kilometers

def add_lat_long_to_df(dataset):
    api_key = "8dad1cc087374a6ba988e6371e45911b"

    if os.path.exists("./coordinates.csv"):
        # print("Coordinates file exists.")
        coordinates_df = (
            pd.read_csv("./coordinates.csv")
            .drop_duplicates(subset="CUST")
            .reset_index(drop=True)
        )
        coordinates_df["CUST"] = coordinates_df["CUST"].astype(
            str
        )  # Convert the 'CUST' column to string
        print(coordinates_df["CUST"])
    else:
        print("Creating new coordinates DataFrame...")
        coordinates_df = pd.DataFrame(
            columns=["CUST", "Latitude", "Longitude"])
    print("Updating coordinates...")
    # Iterate through the dataset
    for i in range(len(dataset)-1):
        cust = str(dataset.at[i, "CUST"])  # Ensure CUST is treated as a string

        # Check if the customer is already in the coordinates DataFrame
        if cust in coordinates_df["CUST"].values:
            # print(f"Using existing coordinates for {dataset.at[i, 'CUST NAME']}")
            row = coordinates_df[coordinates_df["CUST"] == cust]
            dataset.at[i, "Latitude"] = row["Latitude"].values[0]
            dataset.at[i, "Longitude"] = row["Longitude"].values[0]
        else:
            # Construct the address
            print(f"I = {i}    Name: {dataset.at[i, 'CUST NAME']}")
            name = dataset.at[i, "CUST NAME"]
            house_number = dataset.at[i, "HOUSE NUMBER"]
            address = dataset.at[i, "ADDRESS"]
            city = dataset.at[i, "CITY"]
            short_zip = str(dataset.at[i, "ZIP"])[:5]
            # print(
            #     f"Name: {name}, House Number: {house_number}, Address: {address}, City: {city}, ZIP: {short_zip}")
            # print(f"Quote Plus Name: {quote_plus(name)}")
            # print(f"Quote Plus House Number: {quote_plus(house_number)}")
            # print(f"Quote Plus Address: {quote_plus(address)}")
            # print(f"Quote Plus City: {quote_plus(city)}")
            # print(f"Quote Plus ZIP: {quote_plus(short_zip)}")

            # Encode components for URL
            url = f"https://api.geoapify.com/v1/geocode/search?name={quote_plus(name)}&housenumber={quote_plus(house_number)}&street={quote_plus(address)}&city={quote_plus(city)}&postcode={short_zip}&format=json&apiKey={api_key}"
            # print(url)
            # Make the request
            resp = requests.get(url, headers={"Accept": "application/json"})

            if resp.status_code == 200:
                resp_query = resp.json()
                if resp_query["results"]:
                    lat, lon = (
                        resp_query["results"][0]["lat"],
                        resp_query["results"][0]["lon"],
                    )
                    dataset.at[i, "Latitude"] = lat
                    dataset.at[i, "Longitude"] = lon
                    # Append new coordinates to coordinates_df and the CSV file
                    new_row = pd.DataFrame(
                        [[cust, lat, lon]], columns=[
                            "CUST", "Latitude", "Longitude"]
                    )
                    coordinates_df = pd.concat(
                        [coordinates_df, new_row], ignore_index=True)
                    new_row.to_csv("coordinates.csv", mode="a",
                                   header=False, index=False)
                    print(f"Added coordinates for {name}")
                else:
                    print(f"No results found for {name}")
            else:
                print(
                    f"Failed to get coordinates for {name}: HTTP {resp.status_code}")
    dataset.to_csv("updated_dataset.csv", index=False)
    # Save the updated coordinates DataFrame
    coordinates_df.to_csv("coordinates.csv", index=False, mode="w")
    return dataset

    # save dataset to csv

def haversine_vectorized(latitudes, longitudes, depot_index=0, unit="kilometers"):
    # Your existing haversine_vectorized function
    # ... (keep the existing implementation)

def create_distance_matrix(dataset):
    latitudes = dataset["Latitude"].to_numpy()
    longitudes = dataset["Longitude"].to_numpy()
    distance_matrix = haversine_vectorized(latitudes, longitudes, unit="kilometers")
    distance_matrix *= 10
    distance_matrix += 0.9999
    distance_matrix = distance_matrix.astype(int)
    mask = ~np.eye(distance_matrix.shape[0], dtype=bool)
    distance_matrix = np.where(mask & (distance_matrix == 0), distance_matrix + 1, distance_matrix)
    return distance_matrix

def create_data_model(dataset, distance_matrix):
    data = {}
    data["num_vehicles"] = 50  # Adjust as needed
    data["depot"] = 0
    data["demands"] = dataset["Companion"].tolist()
    data["demands2"] = dataset["Machine"].tolist()
    data["distance_matrix"] = distance_matrix.tolist()
    data["vehicle_capacities"] = [1900] * data["num_vehicles"]  # Adjust as needed
    data["vehicle_capacities2"] = [3500] * data["num_vehicles"]  # Adjust as needed
    return data

def create_routing_model(data, manager):
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return data["distance_matrix"][from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        return data["demands"][from_node]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # null capacity slack
        data["vehicle_capacities"],  # vehicle maximum capacities
        True,  # start cumul to zero
        "Capacity",
    )

    def demand_callback2(from_index):
        from_node = manager.IndexToNode(from_index)
        return data["demands2"][from_node]

    demand_callback_index2 = routing.RegisterUnaryTransitCallback(demand_callback2)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index2,
        0,  # null capacity slack
        data["vehicle_capacities2"],  # vehicle maximum capacities
        True,  # start cumul to zero
        "Capacity2",
    )

    return routing

def solve_routing_problem(data, manager, routing):
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = 300  # Adjust as needed
    solution = routing.SolveWithParameters(search_parameters)
    return solution

def iterative_improvement(data, manager, routing, initial_solution, max_iterations=100):
    best_solution = initial_solution
    best_objective = initial_solution.ObjectiveValue()

    for _ in range(max_iterations):
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = 10  # Short time limit for each iteration
        
        new_solution = routing.SolveFromAssignmentWithParameters(
            best_solution.Assignment(), search_parameters
        )
        
        if new_solution:
            new_objective = new_solution.ObjectiveValue()
            if new_objective < best_objective:
                best_solution = new_solution
                best_objective = new_objective

    return best_solution

def update_dataset_with_solution(dataset, manager, routing, solution):
    updated_dataset = dataset.copy()
    for vehicle_id in range(data["num_vehicles"]):
        index = routing.Start(vehicle_id)
        route_number = vehicle_id + 1
        stop_number = 1
        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            updated_dataset.loc[node_index, "NEW RT"] = route_number
            updated_dataset.loc[node_index, "NEW STOP"] = stop_number
            index = solution.Value(routing.NextVar(index))
            stop_number += 1
    return updated_dataset

def process_data(csv_file):
    # Read the uploaded file into a DataFrame
    df = pd.read_csv(csv_file, header=0)

    # Perform initial data preprocessing
    new_df = pd.DataFrame({
        'BR': df['BR'],
        'RT': df['RT'],
        'DAY': df['DAY'].astype(str).str.replace('B', ''),
        'STOP': df['STOP'].astype(str).str.split(',').explode(),
        'NEW BR': df['BR'],
        'NEW RT': df['RT'],
        'NEW DAY': df['DAY'].astype(str).str.replace('B', ''),
        'NEW STOP': df['STOP'].astype(str).str.split(',').explode(),
        'CUST': df['CUST'],
        'CUST NAME': df['CUST NAME'],
        'HOUSE NUMBER': '',
        'ADDRESS': df['ADDRESS'],
        'CITY': df['CITY'],
        'ZIP': df['ZIP'].astype(str).str[:5],
        'EST DATE': df['EST DATE'],
        'BIG 5 AVG': df['BIG 5 AVG'],
        'COMP AVG': df['COMP AVG'],
        'Latitude': 0,
        'Longitude': 0,
        'Machine': df['BIG 5 AVG'],
        'Companion': df['COMP AVG']
    })

    new_df['Multi-Stop'] = new_df.groupby('CUST').cumcount() + 1

    # Add latitude and longitude to the DataFrame
    new_df = add_lat_long_to_df(new_df)

    # Create distance matrix
    distance_matrix = create_distance_matrix(new_df)

    # Setup the OR problem
    data = create_data_model(new_df, distance_matrix)
    manager = pywrapcp.RoutingIndexManager(len(data["distance_matrix"]), data["num_vehicles"], data["depot"])
    routing = create_routing_model(data, manager)

    # Solve the problem
    initial_solution = solve_routing_problem(data, manager, routing)

    # Perform iterative improvement
    best_solution = iterative_improvement(data, manager, routing, initial_solution)

    # Update the dataset with the optimized solution
    final_dataset = update_dataset_with_solution(new_df, manager, routing, best_solution)

    # Connect to the SQLite database
    conn = sqlite3.connect('myapp.db')

    # Load the final DataFrame into the database
    final_dataset.to_sql('route_info', conn, if_exists='replace', index=False)

    # Close the database connection
    conn.close()

if __name__ == '__main__':
    csv_file = sys.argv[1]
    print(f"Processing data from {csv_file}")
    process_data(csv_file)
