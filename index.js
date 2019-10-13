const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const app = express();

const port = process.env.PORT || 8000;

app.use(bodyParser.urlencoded({ extended: true }));

let db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "watermelon_database",
  port: "3306",
  socketPath: "/Applications/MAMP/tmp/mysql/mysql.sock"
});

app.get('/', function(req, res) {
    let response = { "page": "home" };
    res.send(JSON.stringify(response));
});

/* =============== users =============== */

app.get('/users', function(req, res) {
  db.query("SELECT * FROM users;", function(err, result, fields) {
    if(err) throw err;

    let response = { "page": "users", "result": result };
    res.send(JSON.stringify(response));
  });
});

app.post('/users', function(req, res) {
  let first_name = req.body.first_name;
  let last_name = req.body.last_name;
  let email = req.body.email;
  let password = req.body.password;
  let is_admin = req.body.is_admin;
  let token = req.headers["x-auth-token"];

  let query = `INSERT INTO users (first_name, last_name, email, password, is_admin, api_key) VALUES ('${first_name}', '${last_name}', '${email}', '${password}', '${is_admin}', '${token}')`;

  db.query(query, function(err, result, fields) {
    if(err) throw err;
    res.send(JSON.stringify("SUCCESS"));
  })
});

app.get('/users/:id', function(req, res) {
  let id = req.params.id;
  let query = `SELECT * FROM users WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err) throw err;

    res.send(JSON.stringify(result));
  });
});

app.put('/users/:id', function(req, res) {
  let id = req.params.id;
  let query = `UPDATE users SET`;
  let conditions = [`first_name`, `last_name`, `email`, `password`, `is_admin`];

  for(let index in conditions) {
    if(conditions[index] in req.query) {
      if(query.indexOf("=") > 0)
        query += `,`;

      query += ` ${conditions[index]} = '${req.query[conditions[index]]}'`;

    }
  }

  query += ` WHERE id=${id};`;

  db.query(query, function(err, result, fields) {
    if(err) throw err;

    res.send(JSON.stringify(result));
  });
});

app.delete('/users/:id', function(req, res) {
  let id = req.params.id;
  let username = req.body.username;
  let query = `DELETE FROM users WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err) throw err;

    res.send(JSON.stringify("SUCCESS"));
  });
});

/* =============== cards =============== */

app.get('/cards', function(req, res) {
  db.query("SELECT * FROM cards;", function(err, result, fields) {
    if(err) throw err;

    let response = { "page": "cards", "result": result };
    res.send(JSON.stringify(response));
  });
});

app.post('/cards', function(req, res) {
  let user_id = req.body.user_id;
  let last_4= req.body.last_4;
  let brand = req.body.brand;
  let expired_at = req.body.expired_at;

  let query = `INSERT INTO cards (user_id, last_4, brand, expired_at) VALUES ('${user_id}', '${last_4}', '${brand}', '${expired_at}')`;

  db.query(query, function(err, result, fields) {
    if(err) throw err;
    res.send(JSON.stringify("SUCCESS"));
  })
});

app.put('/cards/:id', function(req, res) {
  let id = req.params.id;
  let query = "UPDATE cards SET";
  let conditions = ["user_id", "last_4", "brand", "expired_at"];

  for(let index in conditions) {
    if(conditions[index] in req.query) {
      if(query.indexOf("=") > 0)
        query += `,`;

      query += ` ${conditions[index]} = '${req.query[conditions[index]]}'`;

    }
  }

  query += ` WHERE id=${id};`;

  db.query(query, function(err, result, fields) {
    if(err) throw err;

    res.send(JSON.stringify(result));
  });
});

app.delete('/cards/:id', function(req, res) {
  let id = req.params.id;
  let username = req.body.username;
  let query = `DELETE FROM cards WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err) throw err;

    res.send(JSON.stringify("SUCCESS"));
  });
});

/* =============== wallets =============== */

app.get('/wallets', function(req, res) {
  db.query("SELECT * FROM wallets;", function(err, result, fields) {
    if(err) throw err;

    let response = { "page": "wallets", "result": result };
    res.send(JSON.stringify(response));
  });
});

app.get('/wallets/:wallet_id', async (req, res, next) => {
  let wallet_id = req.params.wallet_id;
  var balance = 0;

  try {
    balance = await sumPay("payins", wallet_id);
    balance -= await await sumPay("payouts", wallet_id);

    let response = { "wallet_id": parseInt(wallet_id, 10), "balance": balance/100 }; //Number.parseFloat(balance/100).toFixed(2)
    res.send(JSON.stringify(response));
  } catch (e) {
    next(e);
  }
});

function sumPay(table, wallet_id) {
  let query = `SELECT * FROM ${table} WHERE wallet_id=${wallet_id}`;
  let balance = 0;

  return new Promise(resolve => {
    db.query(query, function(err, result, fields) {
      if(err) throw err;

      for(let index in result) {
        balance += result[index].amount;
      }
      resolve(balance);
      });
  });
}

/* =============== payins =============== */

app.get('/payins', function(req, res) {
  db.query("SELECT * FROM payins", function(err, result, fields) {
    if(err) throw err;

    let response = { "page": "payins", "result": result };
    res.send(JSON.stringify(response));
  });
});

app.get('/payins/:wallet_id', function(req, res) {
  let wallet_id = req.params.wallet_id;
  let query = `SELECT * FROM payins WHERE wallet_id=${wallet_id}`;
  db.query(query, function(err, result, fields) {
    if(err) throw err;

    let response = { "page": "payins", "result": result };
    res.send(JSON.stringify(response));
  });
});

app.post('/payins', function(req, res) {
  let wallet_id = req.body.wallet_id;
  let amount = req.body.amount * 100;
  let query = `INSERT INTO payins (wallet_id, amount) VALUES ('${wallet_id}', '${amount}')`;

  db.query(query, function(err, result, fields) {
    if(err) throw err;
    res.send(JSON.stringify("SUCCESS: " + amount/100 + " credited on " + wallet_id));
  })
});

/* =============== payouts =============== */

app.get('/payouts', function(req, res) {
  db.query("SELECT * FROM payouts", function(err, result, fields) {
    if(err) throw err;

    let response = { "page": "payouts", "result": result };
    res.send(JSON.stringify(response));
  });
});

app.get('/payouts/:wallet_id', function(req, res) {
  let wallet_id = req.params.wallet_id;
  let query = `SELECT * FROM payouts WHERE wallet_id=${wallet_id}`;
  db.query(query, function(err, result, fields) {
    if(err) throw err;

    let response = { "page": "payouts", "result": result };
    res.send(JSON.stringify(response));
  });
});

app.post('/payouts', function(req, res) {
  let wallet_id = req.body.wallet_id;
  let amount = req.body.amount * 100;
  let query = `INSERT INTO payouts (wallet_id, amount) VALUES ('${wallet_id}', '${amount}')`;

  db.query(query, function(err, result, fields) {
    if(err) throw err;
    res.send(JSON.stringify("SUCCESS: " + amount/100 + " charged on " + wallet_id));
  })
});

/* =============== transfers =============== */

app.get('/transfers', function(req, res) {
  let response = { "page": "transfers" };
  res.send(JSON.stringify(response));
});


app.listen(port, function() {
  db.connect(function(err) {
    if(err) throw err;
    console.log('Connection to database successful!');
  });
  console.log('Watermelon listening on port ' + port);
});
//app.listen(port);

process.on('uncaughtException', function (err) {
    console.log(err);
});
