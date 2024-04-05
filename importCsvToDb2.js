const csvParser = require('csv-parser');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const filePath = "./final_dataset5.csv";

// Open a database connection
let db = new sqlite3.Database('./myapp.db', (err) => {
  if (err) {
    console.error(err.message);
    return;
  }
  console.log('Connected to the SQLite database.');

  // Drop the table if it exists
  db.run('DROP TABLE IF EXISTS route_info', [], (dropErr) => {
    if (dropErr) {
      console.error(dropErr.message);
      return;
    }
    console.log('Table dropped');

    // Create the table
    db.run(`CREATE TABLE route_info (
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
      big_5_avg TEXT,
      comp_avg TEXT,
      latitude REAL,
      longitude REAL,
      machine REAL,
      companion REAL
    )`, [], (createErr) => {
      if (createErr) {
        console.error(createErr.message);
        return;
      }
      console.log('Table created');

      // Now that the table is created, start reading and importing CSV data
      console.log(`Reading data from ${filePath}`);
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (row) => {
          const insertSql = `INSERT INTO route_info (
            br, rt, day, stop, new_br, new_rt, new_day, new_stop, cust, cust_name, house_number,
            address, city, zip, est_date, big_5_avg, comp_avg, latitude, longitude, machine,
            companion
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

          const insertParams = [
            row.BR, row.RT, row.DAY, row.STOP, row["NEW BR"], row["NEW RT"], row["NEW DAY"], row["NEW STOP"],
            row.CUST, row["CUST NAME"], row["HOUSE NUMBER"], row.ADDRESS, row.CITY, row.ZIP, row["EST DATE"],
              row["BIG 5 AVG"], row["COMP AVG"], row.Latitude, row.Longitude, row["BIG 5 AVG"], row["COMP AVG"]
          ];

          db.run(insertSql, insertParams, (insertErr) => {
            if (insertErr) {
              console.error(insertErr.message);
              return;
            }
          });
        })
        .on('end', () => {
          console.log('CSV file successfully processed');
          db.close();
        });
    });
  });
});
