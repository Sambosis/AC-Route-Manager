const csvParser = require('csv-parser');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// The path to the uploaded file, passed as a command line argument
const filePath = process.argv[2];
const coordinatesFilePath = path.join(__dirname, 'coordinates.csv'); // Adjust the path to where coordinates.csv is located

if (!filePath) {
  console.error('Please provide a file path for the route file');
  process.exit(1);
}

// Read coordinates.csv and create a mapping of cust IDs to their coordinates
const coordinatesMap = new Map();

fs.createReadStream(coordinatesFilePath)
  .pipe(csvParser())
  .on('data', (row) => {
    coordinatesMap.set(row.cust, { latitude: row.latitude, longitude: row.longitude });
  })
  .on('end', () => {
    console.log('Coordinates loaded');
    // After loading coordinates, process the uploaded route file
    processFile(filePath);
  });

function processFile(filePath) {
  // Open a database connection
  let db = new sqlite3.Database('./myapp.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error(err.message);
    console.log('Connected to the SQLite database.');
  });



  db.run('DROP TABLE IF EXISTS route_info', [], (dropErr) => {
    if (dropErr) {
      console.error(dropErr.message);
      return;
    }
    console.log('Table dropped');


    db.serialize(() => {
      // Ensure the table exists
      db.run(`CREATE TABLE IF NOT EXISTS route_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      br TEXT,
      rt TEXT,
      day TEXT,
      stop TEXT,
      new_br TEXT,
      new_rt TEXT,
      new_day TEXT,
      new_stop TEXT,
      cust TEXT,
      cust_name TEXT,
      house_number TEXT,
      address TEXT,
      city TEXT,
      zip TEXT,
      est_date TEXT,
      big_5_avg REAL,
      comp_avg REAL,
      latitude REAL,
      longitude REAL,
      machine REAL,
      companion REAL
      )`);

      // Process the route file
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (row) => {
          // Look up coordinates for the current cust
          const coords = coordinatesMap.get(row.cust) || {};
          const insertSql = `INSERT INTO route_info (
            br, rt, day, stop, new_br, new_rt, new_day, new_stop, cust, cust_name, house_number,
            address, city, zip, est_date, big_5_avg, comp_avg, latitude, longitude, machine,
            companion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

          const insertParams = [
            row.BR, row.RT, row.DAY, row.STOP, row["NEW BR"], row["NEW RT"], row["NEW DAY"], row["NEW STOP"],
            row.CUST, row["CUST NAME"], row["HOUSE NUMBER"], row.ADDRESS, row.CITY, row.ZIP, row["EST DATE"],
            row["BIG 5 AVG"], row["COMP AVG"], row['Latitude'], row['Longitude'], row["BIG 5 AVG"], row["COMP AVG"]
            ];
          console.log("coords", coords.Latitude, coords.Longitude)
          db.run(insertSql, insertParams, function (err) {
            if (err) return console.error(err.message);
            console.log(`A row has been inserted with rowid ${this.lastID}`);
          });
        })
        .on('end', () => {
          console.log('Route file successfully processed');
          db.close();
        });
    });
  });
}