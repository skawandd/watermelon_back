const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const app = express();

const port = process.env.PORT || 8000, prefix = '/v1';

app.use(bodyParser.urlencoded({ extended: true }));

let db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "watermelon_database",
  port: "3306",
  socketPath: "/Applications/MAMP/tmp/mysql/mysql.sock",
  timezone: "utc"
});

app.get(prefix+'/', function(req, res) {
    let response = { "page": "home" };
    res.send(JSON.stringify(response)).status(200);
});

/* =============== users =============== */

app.get(prefix+'/users', function(req, res) {
  db.query("SELECT * FROM users;", function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "users", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.post(prefix+'/users', function(req, res) {
  let first_name = req.body.first_name;
  let last_name = req.body.last_name;
  let email = req.body.email;
  let password = req.body.password;
  let is_admin = req.body.is_admin;
  let token = req.headers["x-auth-token"];

  let query = `INSERT INTO users (first_name, last_name, email, password, is_admin, api_key) VALUES ('${first_name}', '${last_name}', '${email}', '${password}', '${is_admin}', '${token}')`;

  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify("SUCCESS")).status(200);
  })
});

app.get(prefix+'/users/:id', async function(req, res) {
  let id = await getId(res, "users", req.params.id);
  let query = `SELECT * FROM users WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);



    res.send(JSON.stringify(result)).status(200);
  });
});

app.put(prefix+'/users/:id', async function(req, res) {
  let id = await getId(res, "users", req.params.id)
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
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify(result)).status(200);
  });
});

app.delete(prefix+'/users/:id', async function(req, res) {
  let id = await getId(res, "users", req.params.id);
//  let username = req.body.username;
  let query = `DELETE FROM users WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify("SUCCESS")).status(204);
  });
});

/* =============== cards =============== */

app.get(prefix+'/cards', function(req, res) {
  db.query("SELECT * FROM cards;", function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "cards", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.post(prefix+'/cards', function(req, res) {
  let user_id = req.body.user_id;
  let last_4= req.body.last_4;
  let brand = req.body.brand;
  let expired_at = req.body.expired_at;

  let query = `INSERT INTO cards (user_id, last_4, brand, expired_at) VALUES ('${user_id}', '${last_4}', '${brand}', '${expired_at}')`;

  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify("SUCCESS"));
  })
});

app.put(prefix+'/cards/:id', async function(req, res) {
  let id = await getId(res, "cards", req.params.id)
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
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify(result)).status(200);
  });
});

app.delete(prefix+'/cards/:id', async function(req, res) {
  let id = await getId(res, "cards", req.params.id);
  let username = req.body.username;
  let query = `DELETE FROM cards WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify("SUCCESS")).status(204);
  });
});

/* =============== wallets =============== */

app.get(prefix+'/wallets', function(req, res) {
  db.query("SELECT * FROM wallets", function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "wallets", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.get(prefix+'/wallets/:wallet_id', async (req, res, next) => {
  let wallet_id = await getId(res, "wallets", req.params.wallet_id)
  var balance = 0;

  try {
    balance += await sumPay(res, "payins", wallet_id);
    balance -= await sumPay(res, "payouts", wallet_id);

    balance += await sumTransfers(res, "credited_wallet_id", wallet_id);
    balance -= await sumTransfers(res, "debited_wallet_id", wallet_id);

    let response = { "wallet_id": parseInt(wallet_id, 10), "balance": balance/100 }; //Number.parseFloat(balance/100).toFixed(2)
    res.send(JSON.stringify(response)).status(200);
  } catch (e) {
    next(e);
  }
});

function sumPay(res, table_name, wallet_id) {
  let query = `SELECT * FROM ${table_name} WHERE wallet_id=${wallet_id}`;
  return sumAmount(res, query);
}

function sumTransfers(res, column_name, wallet_id) {
  let query = `SELECT * FROM transfers WHERE ${column_name}=${wallet_id}`;
  return sumAmount(res, query);
}

function sumAmount(res, query) {
  let balance = 0;

  return new Promise(resolve => {
    db.query(query, function(err, result, fields) {
      if(err)
        res.send(JSON.stringify(err)).status(500);

      for(let index in result)
        balance += result[index].amount;

      resolve(balance);
    });
  });
}

function getId(res, table_name, id_value) {
  let query = `SELECT * FROM ${table_name} WHERE id=${id_value}`;
  return new Promise(resolve => {
    db.query(query, function(err, result, fields) {
      if(err)
        res.send(JSON.stringify(err)).status(500);

      else if(result.length == 0)
        res.send(JSON.stringify("ERROR: id not found")).status(404);

      else {
        let id = result[0].id;
        resolve(id);
      }
    });
  });
}

/* =============== payins =============== */

app.get(prefix+'/payins', function(req, res) {
  db.query("SELECT * FROM payins", function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "payins", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.get(prefix+'/payins/:wallet_id', async function(req, res) {
  let wallet_id = await getId(res, "payins", req.params.wallet_id);
  let query = `SELECT * FROM payins WHERE wallet_id=${wallet_id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "payins", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.post(prefix+'/payins', function(req, res) {
  let wallet_id = req.body.wallet_id;
  let amount = req.body.amount * 100;
  let query = `INSERT INTO payins (wallet_id, amount) VALUES ('${wallet_id}', '${amount}')`;

  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify("SUCCESS: " + amount/100 + " credited on " + wallet_id)).status(200);
  })
});

/* =============== payouts =============== */

app.get(prefix+'/payouts', function(req, res) {
  db.query("SELECT * FROM payouts", function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "payouts", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.get(prefix+'/payouts/:wallet_id', async function(req, res) {
  let wallet_id = await getId(res, "payouts", req.params.wallet_id);
  let query = `SELECT * FROM payouts WHERE wallet_id=${wallet_id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "payouts", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.post(prefix+'/payouts', function(req, res) {
  let wallet_id = req.body.wallet_id;
  let amount = req.body.amount * 100;
  let query = `INSERT INTO payouts (wallet_id, amount) VALUES ('${wallet_id}', '${amount}')`;

  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify("SUCCESS: " + amount/100 + " charged on " + wallet_id)).status(200);
  })
});

/* =============== transfers =============== */

app.get(prefix+'/transfers', function(req, res) {
  db.query("SELECT * FROM transfers", function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    let response = { "page": "transfers", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.post(prefix+'/transfers', function(req, res) {
  let debited_wallet_id = req.body.debited_wallet_id;
  let credited_wallet_id = req.body.credited_wallet_id;
  let amount = req.body.amount * 100;
  let query = `INSERT INTO transfers (debited_wallet_id, credited_wallet_id, amount) VALUES ('${debited_wallet_id}', '${credited_wallet_id}', '${amount}')`;

  db.query(query, function(err, result, fields) {
    if(err)
      res.send(JSON.stringify(err)).status(500);

    res.send(JSON.stringify("SUCCESS: " + amount/100 + " transfered from " + debited_wallet_id + " to " + credited_wallet_id)).status(200);
  })
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
