const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const app = express();
var debug = true, cpt = 0;

const port = process.env.PORT || 8000, prefix = '/v1';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser('secret'));

if(debug==true){
    app.use ((req,res,next) => {
      console.log('V V V\n');
      next();
    },function(req, res, next) {
        console.log(++cpt + '. Request URL:'+ req.originalUrl + '\t params : ' + req.params);
        console.log('Request Type:', req.method);
        console.log('body:', req.body);
        console.log('x-auth-token:', req.headers["x-auth-token"])
        next();
      }
    );
  }

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

app.post(prefix+'/users', function(req,res){
    let email = req.body.email;
    let last_name = req.body.last_name;// result.insertId > a mettre avec le retour sql
    let first_name = req.body.first_name;
    let password = req.body.password;
    let is_admin = req.body.is_admin;
    let access_token = createToken(email);
    let query = `INSERT INTO users (first_name, last_name, email, password, is_admin, api_key) VALUES ('${first_name}', '${last_name}', '${email}', '${password}', ${is_admin}, '${access_token}')`;
    let buffer;

    executeQuery(query).then(
      function(result) {
        executeQuery(`SELECT * FROM users WHERE id=${result.insertId}`).then(
          result => {
            buffer = usersView(result);
            console.log("result: ", result);
            console.log("buffer: ", buffer);
            console.log("ID___", buffer[0].id);
            executeQuery(`INSERT INTO wallets (user_id) VALUES (${buffer[0].id})`).then(
              result => res.status(200).send(JSON.stringify(buffer[0])),
              error => res.status(400).send(JSON.stringify("Bad Request"))
            );
          },
          error => console.log(error)
        );
      },

      error => console.log(error)
    );

/*    db.query(query,function(err,result,fields){
      if(err) throw err;
      console.log('le result :',result);
      getById(res,'users', result.insertId)
      .then(
        (user) => { console.log('le user : ', user); }
      )
    });*/
});

function executeQuery(query) {
  console.log(query);
  return new Promise(function(resolve, reject) {
    db.query(query, function(err, result, fields) {
      if(err)
        reject(err);

      else if(result.length == 0)
        reject(404);

      else {
        resolve(result);
      }
    });
  });
}

function usersView(result) {
  let response = [];

  for(let index in result) {
    response.push({
        "id" : result[index].id,
        "email" : result[index].email,
        "first_name" : result[index].first_name,
        "last_name" : result[index].last_name,
        "is_admin" : (result[index].is_admin===1),
        "access_token" : result[index].api_key
    });
  }
  return response;
}

function usersViewV2(result) {
  let response = [];

  for(let index in result) {
    response.push({
        "id" : result[index].id,
        "email" : result[index].email,
        "first_name" : result[index].first_name,
        "last_name" : result[index].last_name,
        "is_admin" : (result[index].is_admin===1),
    });
  }
  return response;
}

function cardsView(result) {
  let response = [];

  for(let index in result) {
    console.log(result[index]);
    response.push({
        "id" : result[index].id,
        "user_id" : result[index].user_id,
        "last_4" : result[index].last_4,
        "brand" : result[index].brand,
        "expired_at" : result[index].expired_at
    });
  }
  return response;
}

function walletsView(result) {
  let response = [];

  for(let index in result) {
    console.log(result[index]);
    response.push({
        "id" : result[index].id,
        "user_id" : result[index].user_id,
        "last_4" : result[index].last_4,
        "brand" : result[index].brand,
        "expired_at" : result[index].expired_at
    });
  }
  return response;
}

function getBalance() {

}

/* =============== auth =============== */

app.post(prefix+'/login', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let email = req.body.email;
  let password = req.body.password;
  let query = `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`;

  if(access_token !== undefined) {
//    console.log("FDPPPPPPPP",access_token);
    executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`).then(
      result =>  {
        res.status(200).send(JSON.stringify({"access_token": access_token}))
      },
      error => {
        res.status(401).send("ACCESS DENIED");
      }
    );
  } else if(email !== undefined && password !== undefined) {
    executeQuery(query).then(
      result =>  {
        let token = createToken(email);
        res.status(200).send(JSON.stringify({"access_token": token}))
      },
      error => res.status(401).send("ACCESS DENIED")
    );
  } else {
    res.status(400).send("ACCESS DENIED");
  }
/*  db.query(query, function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    if(result.length > 0) {
      let secretKey = fs.readFileSync('secret.key');
      let token = jwt.sign({ email: email }, secretKey);

      let options = {
        maxAge: 1000 * 60, // would expire after 1 minute
        httpOnly: true, // The cookie only accessible by the web server
        signed: true // Indicates if the cookie should be signed
    }

    // Set cookie
      res.cookie('access_token', token, options);
      res.status(200).send(token);
    }
      else
        res.status(401).send("ACCESS DENIED");

  });*/
});

function createToken(email) {
  let secretKey = fs.readFileSync('secret.key');
  let token = jwt.sign({ email: email }, secretKey);

  return token;
}

app.use(function(req, res, next) {
  let token = req.headers["x-auth-token"];

    try {
      let secretKey = fs.readFileSync('secret.key')
      let decoded = jwt.verify(token, secretKey);
      let query = `SELECT * FROM users WHERE email='${decoded.email}'`;

      db.query(query, function(err, result, fields) {
        if(err)
          res.status(500).send(JSON.stringify(err));

        if(result.length > 0)
          next();
        else
          res.status(401).send("ACCESS DENIED");
      });
    } catch (e) {
      res.status(401).send("ACCESS DENIED");
    }
});

/* =============== users =============== */

app.get(prefix+'/users', function(req, res) {
  console.log("OK");
  if ("x-auth-token" in req.headers) {
    let access_token = req.headers["x-auth-token"];
    let query = `SELECT * FROM users WHERE api_key='${access_token}'`;
    executeQuery(query).then(
      result =>  {
        console.log("result",result);
        if(result[0].is_admin===1) {
          executeQuery(`SELECT * FROM users`).then(
            result => res.status(200).send(JSON.stringify(usersViewV2(result))),
            error => res.status(401).send("ACCESS DENIED")
          );
        } else
          res.status(200).send(JSON.stringify(usersViewV2(result)));//TODO));
      },
      error => res.status(401).send("ACCESS DENIED")
    );
  } else
    res.status(401).send(JSON.stringify("ACCESS DENIED"));

});

app.get(prefix+'/users/:id', async function(req, res) {
  let id = await getId(res, "users", req.params.id);
  let query = `SELECT * FROM users WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    res.status(200).send(JSON.stringify(usersViewV2(result)));
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
      res.status(500).send(JSON.stringify(err));

    res.send(JSON.stringify(result)).status(200);
  });
});

app.delete(prefix+'/users/:id', async function(req, res) {
  let id = await getId(res, "users", req.params.id);
//  let username = req.body.username;
  let query = `DELETE FROM users WHERE id=${id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    res.send(JSON.stringify("SUCCESS")).status(204);
  });
});

/* =============== cards =============== */

app.get(prefix+'/cards', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = `SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards`;

  executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`).then(
    result => {
      console.log("***********************", result);
      if(result[0].is_admin !== 1)
        query += ` WHERE user_id = ${result[0].id}`;
      executeQuery(query).then(
        result => res.status(200).send(JSON.stringify(cardsView(result))),
        error => res.status(error).send(JSON.stringify("ACCESS DENIED1"))
      );
  },
  error => res.status(401).send(JSON.stringify("ACCESS DENIED2"))
  );
});

app.get(prefix+'/cards/:id', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let id = req.params.id;
  let query = `SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards WHERE id = ${id}`;

  executeQuery(query).then(
    result => res.status(200).send(JSON.stringify(cardsView(result)[0])),
    error => res.status(error).send(JSON.stringify("ACCESS DENIED"))
  );
});

app.post(prefix+'/cards', function(req, res) {
  let user_id = req.body.user_id;
  let last_4= req.body.last_4;
  let brand = req.body.brand;
  let expired_at = req.body.expired_at;

  let query = `INSERT INTO cards (user_id, last_4, brand, expired_at) VALUES ('${user_id}', '${last_4}', '${brand}', '${expired_at}')`;

  executeQuery(query).then(
    result => {
      executeQuery(`SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards WHERE id = ${result.insertId}`).then(
        result => res.status(200).send(JSON.stringify(cardsView(result)[0])),
        error => res.status(400).send("Bad Request")
      );
    },
    error => res.status(400).send("Bad Request")
  );
});

app.put(prefix+'/cards/:id', async function(req, res) {
  let id = req.params.id;
  let query = "UPDATE cards SET";
  let conditions = ["user_id", "last_4", "brand", "expired_at"];

  console.log("QUERY: ", req.body);

  for(let index in conditions) {
    if(conditions[index] in req.body) {
      if(query.indexOf("=") > 0)
        query += `,`;

      if(req.body[conditions[index]] !== undefined)
        query += ` ${conditions[index]} = '${req.body[conditions[index]]}'`;
    }
  }

  query += ` WHERE id=${id};`;

  executeQuery(query).then(
    result => {
      executeQuery(`SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards WHERE id = ${id}`).then(
        result => res.status(200).send(JSON.stringify(cardsView(result)[0])),
        error => res.status(404).send(JSON.stringify("Note found"))
      );
    },
    error => res.status(400).send(JSON.stringify("Bad Request"))
  );


});

app.delete(prefix+'/cards/:id', async function(req, res) {
  let id = req.params.id;
  let username = req.body.username;
  let query = `DELETE FROM cards WHERE id=${id}`;

  executeQuery(query).then(
    result => {
      if(result.affectedRows == 0)
        res.status(404).send(JSON.stringify("Not Found"))
      else
        res.status(204).send("No Content")
    },
    error => res.status(400).send(JSON.stringify("Bad Request"))
  );
});

/* =============== wallets =============== */

app.get(prefix+'/wallets', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = `SELECT * FROM wallets`;

  executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`).then(
    result => {

    //  console.log("***********************", result);
      if(result[0].is_admin !== 1)
        query += ` WHERE user_id = ${result[0].id}`;
      executeQuery(query).then(
        result => res.status(200).send(JSON.stringify(cardsView(result))),
        error => res.status(error).send(JSON.stringify("ACCESS DENIED1"))
      );
  },
  error => res.status(401).send(JSON.stringify("ACCESS DENIED2"))
  );
});

app.get(prefix+'/wallets', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = ``;

  executeQuery
  db.query("SELECT * FROM wallets", function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    let response = { "page": "wallets", "result": result };
    res.status(200).send(JSON.stringify(response));
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
        res.status(500).send(JSON.stringify(err));

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
        res.status(500).send(JSON.stringify(err));

      else if(result.length == 0)
        res.send(JSON.stringify("ERROR: id not found")).status(404);

      else {
        let id = result[0].id;
        resolve(id);
      }
    });
  });
}

function getById(res, table_name, id_value) {
  let query = `SELECT * FROM ${table_name} WHERE id=${id_value}`;
  return new Promise(resolve => {
    db.query(query, function(err, result, fields) {
      if(err)
        res.status(500).send(JSON.stringify(err));

      else if(result.length == 0)
        res.send(JSON.stringify("ERROR: Id not found")).status(404);

      else {
        resolve(result);
      }
    });
  });
}


/* =============== payins =============== */

app.get(prefix+'/payins', function(req, res) {
  db.query("SELECT * FROM payins", function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    let response = { "page": "payins", "result": result };
    res.status(200).send(JSON.stringify(result));
  });
});

app.get(prefix+'/payins/:wallet_id', async function(req, res) {
  let wallet_id = await getId(res, "payins", req.params.wallet_id);
  let query = `SELECT * FROM payins WHERE wallet_id=${wallet_id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

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
      res.status(500).send(JSON.stringify(err));

    res.send(JSON.stringify("SUCCESS: " + amount/100 + " credited on " + wallet_id)).status(200);
  })
});

/* =============== payouts =============== */

app.get(prefix+'/payouts', function(req, res) {
  db.query("SELECT * FROM payouts", function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    let response = { "page": "payouts", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.get(prefix+'/payouts/:wallet_id', async function(req, res) {
  let wallet_id = await getId(res, "payouts", req.params.wallet_id);
  let query = `SELECT * FROM payouts WHERE wallet_id=${wallet_id}`;
  db.query(query, function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

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
      res.status(500).send(JSON.stringify(err));

    res.send(JSON.stringify("SUCCESS: " + amount/100 + " charged on " + wallet_id)).status(200);
  })
});

/* =============== transfers =============== */

app.get(prefix+'/transfers', function(req, res) {
  db.query("SELECT * FROM transfers", function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    let response = { "page": "transfers", "result": result };
    res.send(JSON.stringify(response)).status(200);
  });
});

app.post(prefix+'/transfers', async function(req, res) {
  let debited_wallet_id = await getId(res, "wallets", req.body.debited_wallet_id);
  let credited_wallet_id = await getId(res, "wallets", req.body.credited_wallet_id);
  let amount = req.body.amount * 100;
  let query = `INSERT INTO transfers (debited_wallet_id, credited_wallet_id, amount) VALUES ('${debited_wallet_id}', '${credited_wallet_id}', '${amount}')`;

  db.query(query, function(err, result, fields) {
    if(err)
      res.status(500).send(JSON.stringify(err));

    res.send(JSON.stringify("SUCCESS: " + amount/100 + " transfered from " + debited_wallet_id + " to " + credited_wallet_id)).status(200);
  })
});

/* =============== errors =============== */

// 404
app.use(function(req, res, next) {
  return res.status(404).send({ message: 'Route'+req.url+' Not found.' });
});

// 500
app.use(function(err, req, res, next) {
  return res.status(500).send({ error: err });
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
