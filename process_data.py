import sys
import pandas as pd
import sqlite3
import os
from tqdm import tqdm

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
    for i in tqdm(range(len(dataset)-1)):
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


# Constants
EARTH_RADIUS_KM = 6371  # Earth's radius in kilometers
R = 6371.0



def process_data(csv_file):
    # Read the CSV file into a DataFrame, skipping the header row
    df = pd.read_csv(csv_file, header=0)

    # Perform the desired transformations on the DataFrame
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

    # Assign a unique identifier to each stop based on its order within the customer's visits
    new_df['Multi-Stop'] = new_df.groupby('CUST').cumcount() + 1

    # Add latitude and longitude to the DataFrame
    new_df = add_lat_long_to_df(new_df)

    # Connect to the SQLite database
    conn = sqlite3.connect('myapp.db')

    # Load the DataFrame into the database
    new_df.to_sql('route_info', conn, if_exists='replace', index=False)

    # Close the database connection
    conn.close()


if __name__ == '__main__':
    csv_file = sys.argv[1]
    process_data(csv_file)
