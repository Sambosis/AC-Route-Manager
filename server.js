const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const XLSX = require('xlsx');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const upload = multer({ dest: 'uploads/' })

app.use(express.static('public'));
app.use(express.json());

app.get('/upload', (req, res) => {
  res.sendFile(__dirname + '/upload.html');
});

app.post('/upload', upload.single('routeFile'), (req, res) => {
  console.log('Received file upload request');

  if (req.file) {
    console.log('File received:', req.file);

    try {
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      try {
        const csv = XLSX.utils.sheet_to_csv(worksheet, { skipRows: 2 });
        const csvFilePath = `${req.file.path}.csv`;
        require('fs').writeFileSync(csvFilePath, csv);

        const pythonProcess = spawn('python', ['process_data.py', csvFilePath]);

        pythonProcess.stdout.on('data', (data) => {
          console.log(`Python script output: ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
          console.error(`Python script error: ${data}`);
        });

        pythonProcess.on('close', (code) => {
          console.log(`Python script exited with code ${code}`);
          res.send('File uploaded and processed successfully.');
        });
      } catch (error) {
        console.error('Error converting to CSV:', error);
        res.status(500).send('Error converting to CSV');
      }
    } catch (error) {
      console.error('Error reading Excel file:', error);
      res.status(500).send('Error reading Excel file');
    }
  } else {
    res.status(400).send('No file uploaded.');
  }
});

let db = new sqlite3.Database('./myapp.db', (err) => {
  if (err) {
    console.error('Error connecting to the SQLite database.', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Endpoint to get the initial state of routes, simplified to focus on RT and DAY
app.get('/aggregated-routes', (req, res) => {
  db.all(`SELECT rt, day, cust, cust_name FROM route_info GROUP BY rt, day, cust`, [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    // Aggregating data by RT and DAY
    const routes = rows.reduce((acc, { rt, day, cust, cust_name }) => {
      const key = `${rt}-${day}`;
      if (!acc[key]) {
        acc[key] = { rt, day, customers: [] };
      }
      acc[key].customers.push({ cust, cust_name });
      return acc;
    }, {});

    const aggregatedData = Object.values(routes);
    res.json(aggregatedData);
  });
});

app.get('/api/routes', (req, res) => {
  const sql = `SELECT new_rt, new_day, cust_name, address, machine, companion, latitude, longitude FROM route_info`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.json(rows);
  });
});

// Socket.IO connection setup for handling customer moves
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('moveCustomer', (data) => {
    console.log(`Received move request for customer: ${data.custId} to RT: ${data.newRt} DAY: ${data.newDay}`);
    updateCustomerRoute(data.custId, data.newRt, data.newDay, socket);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  socket.on('moveDayCustomers', ({ fromRt, fromDay, toRt, toDay }) => {
    // Example SQL to move all customers and update both rt/day and new_rt/new_day
    const moveSql = 'UPDATE route_info SET rt = ?, new_rt = ?, day = ?, new_day = ? WHERE rt = ? AND day = ?';
    db.run(moveSql, [toRt, toRt, toDay, toDay, fromRt, fromDay], function (err) {
      if (err) {
        console.error(err.message);
        socket.emit('operationFailed', { error: 'Database error during move' });
      } else {
        console.log(`Moved customers from RT ${fromRt}, Day ${fromDay} to RT ${toRt}, Day ${toDay}`);
        io.emit('customersMoved', { fromRt, fromDay, toRt, toDay });
      }
    });
  });

  socket.on('swapDayCustomers', ({ firstRtDay, secondRtDay }) => {
    const tempRt = "TEMP";
    const tempDay = "0";

    // Step 1: Move first group to temporary location and update both rt/day and new_rt/new_day
    const moveToTempSql = 'UPDATE route_info SET rt = ?, new_rt = ?, day = ?, new_day = ? WHERE rt = ? AND day = ?';
    db.run(moveToTempSql, [tempRt, tempRt, tempDay, tempDay, firstRtDay.rt, firstRtDay.day], function (err) {
      if (err) {
        console.error('Error moving first group to temp:', err.message);
        return;
      }

      // Step 2: Move second group to first group's original RT/Day and update both rt/day and new_rt/new_day
      db.run(moveToTempSql, [firstRtDay.rt, firstRtDay.rt, firstRtDay.day, firstRtDay.day, secondRtDay.rt, secondRtDay.day], function (err) {
        if (err) {
          console.error('Error moving second group to first group\'s original location:', err.message);
          return;
        }

        // Step 3: Move first group from temp to second group's original RT/Day and update both rt/day and new_rt/new_day
        const moveFromTempSql = 'UPDATE route_info SET rt = ?, new_rt = ?, day = ?, new_day = ? WHERE rt = ? AND day = ?';
        db.run(moveFromTempSql, [secondRtDay.rt, secondRtDay.rt, secondRtDay.day, secondRtDay.day, tempRt, tempDay], function (err) {
          if (err) {
            console.error('Error moving first group from temp to second group\'s original location:', err.message);
            return;
          }

          console.log(`Swapped customers between RT ${firstRtDay.rt}, Day ${firstRtDay.day} and RT ${secondRtDay.rt}, Day ${secondRtDay.day}`);
          // Emit an event back to the client to update the UI, if necessary
          io.emit('customersSwapped', { firstRtDay, secondRtDay });
        });
      });
    });
  });
});

// Function to update customer route in the database
function updateCustomerRoute(custId, newRt, newDay, socket) {
  const sql = `UPDATE route_info SET new_rt = ?, rt = ?, new_day = ?, day = ? WHERE cust = ?`;
  db.run(sql, [newRt, newRt, newDay, newDay, custId], function (err) {
    if (err) {
      console.error('Database error:', err.message);
      socket.emit('updateFailed', { custId: custId, message: "Database error" });
      return;
    }
    if (this.changes > 0) {
      console.log(`Customer ${custId} moved to route ${newRt} on day ${newDay}`);
      io.emit('customerMoved', { custId: custId, newRt: newRt, newDay: newDay });
    } else {
      console.log("No rows updated, likely due to no matching customer found.");
      socket.emit('updateFailed', { custId: custId, message: "No rows updated" });
    }
  });
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));