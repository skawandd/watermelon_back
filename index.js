const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const bcrypt = require('bcrypt');
const app = express();

const port = process.env.PORT || 8000,
  prefix = '/v1';

/**
 * @author Dylan Skawand <dylan.skawand@edu.ece.fr>
 **/

app.use(bodyParser.urlencoded({
  extended: true
}));

let db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "watermelon_database",
  port: "3306",
  socketPath: "/Applications/MAMP/tmp/mysql/mysql.sock",
  timezone: "utc"
});

app.get(prefix + '/', function(req, res) {
  let response = {
    "page": "home"
  };
  res.send(JSON.stringify(response)).status(200);
});

app.post(prefix + '/users', async function(req, res) {
  let email = req.body.email;
  let last_name = req.body.last_name;
  let first_name = req.body.first_name;
  let password = req.body.password;
  let is_admin = req.body.is_admin;
  let access_token = makeid(64);

  if (email === undefined || last_name === undefined || first_name === undefined || password === undefined || is_admin === undefined)
    res.status(400).send(JSON.stringify("Bad Request"));

  else {
    bcrypt.hash(req.body.password, 10)
      .then(
        hash => {
          checkEmail(email)
            .then(
              result => {
                executeQuery(`INSERT INTO users (first_name, last_name, email, password, is_admin, api_key) VALUES ('${first_name}', '${last_name}', '${email}', '${hash}', ${is_admin}, '${access_token}')`)
                  .then(
                    function(result) {
                      executeQuery(`SELECT * FROM users WHERE id=${result.insertId}`)
                        .then(
                          userInfo => {
                            executeQuery(`INSERT INTO wallets (user_id) VALUES (${userInfo[0].id})`)
                              .then(
                                result_wallet => {
                                  userInfo[0].api_key = createToken(email);
                                  res.status(200).send(JSON.stringify({
                                    "id": userInfo[0].id,
                                    "email": userInfo[0].email,
                                    "first_name": userInfo[0].first_name,
                                    "last_name": userInfo[0].last_name,
                                    "is_admin": (userInfo[0].is_admin === 1),
                                    "access_token": userInfo[0].api_key
                                  }));
                                },
                                error => res.status(400).send(JSON.stringify("Bad Request"))
                              );
                          },
                          error => res.status(400).send(JSON.stringify("Bad Request")));
                    },
                    error => res.status(400).send(JSON.stringify("Bad Request")));
              },
              error => res.status(400).send(JSON.stringify("Bad Request")));
        },
        error => res.status(400).send(JSON.stringify("Bad Request")));
  }
});


/* =============== auth =============== */

app.post(prefix + '/login', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let email = req.body.email;
  let password = req.body.password;
  let query = `SELECT * FROM users WHERE email = '${email}'`;

  if (access_token !== undefined && access_token.length <= 64) {
    executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`)
      .then(
        result => {
          res.status(200).send(JSON.stringify({
            "access_token": access_token
          }))
        },
        error => res.status(401).send("Unauthorized"));
  } else if (access_token !== undefined && access_token.length > 64) {
    decodeJWT(access_token)
      .then(
        result => {
          executeQuery(`SELECT * FROM users WHERE email = '${result[0].email}'`)
            .then(
              result => {
                res.status(200).send(JSON.stringify({
                  "access_token": result[0].api_key
                }))
              },
              error => {
                res.status(401).send("Unauthorized");
              }
            );
        },
        error => res.status(401).send("Unauthorized"));
  } else if (email !== undefined && password !== undefined) {
    executeQuery(query)
      .then(
        async result => {
            let match = await bcrypt.compare(password, result[0].password);

            if (!match)
              res.status(401).send("Unauthorized");

            else
              res.status(200).send(JSON.stringify({
                "access_token": createToken(email)
              }))
          },
          error => res.status(401).send("Unauthorized")
      );
  } else {
    res.status(400).send("Bad Request");
  }
});

app.use(function(req, res, next) {
  let token = req.headers["x-auth-token"];

  decodeJWT(token)
    .then(
      result => {
        req.headers["x-auth-token"] = result[0].api_key;
        next();
      },
      error => res.status(401).send("Unauthorized")
    );
});

/* =============== users =============== */

const requireSelf = () => {
  return (req, res, next) => {
    let access_token = req.headers["x-auth-token"];
    let id = req.params.id;

    executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`)
      .then(
        userInfo => {
          executeQuery(`SELECT * FROM users WHERE id = ${id}`)
            .then(
              result => {
                if (userInfo[0].id != id && userInfo[0].is_admin !== 1)
                  res.status(403).send(JSON.stringify("Forbidden"));

                else
                  next();
              },
              error => res.status(404).send(JSON.stringify("Not Found")));

        },
        error => {
          res.status(401).send(JSON.stringify("Unauthorized"));
        });
  }
}

app.get(prefix + '/users', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = `SELECT * FROM users`;

  executeQuery(query + ` WHERE api_key = '${access_token}'`)
    .then(
      result => {
        if (result[0].is_admin !== 1)
          res.status(200).send(JSON.stringify(usersView(result)));
        else {
          executeQuery(query)
            .then(
              result => res.status(200).send(JSON.stringify(usersView(result))),
              error => res.sendStatus(error));
        }
      },
      error => res.status(401).send(JSON.stringify("Unauthorized"))
    );
});

app.get(prefix + '/users/:id', function(req, res) {
  let id = req.params.id;
  let query = `SELECT * FROM users WHERE id = ${id}`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(usersView(result)[0])),
      error => res.sendStatus(error));
});

app.put(prefix + '/users/:id', requireSelf(), async function(req, res) {
  let id = req.params.id;
  let access_token = req.headers["x-auth-token"];
  let query = `UPDATE users SET`;
  let conditions = [`first_name`, `last_name`, `email`, `password`, `is_admin`];
  let field = 0;

  if (req.body[`password`] !== undefined)
    req.body.password = await bcrypt.hash(req.body.password, 10);

  for (let index in conditions) {
    if (conditions[index] in req.body) {
      if (query.indexOf("=") > 0)
        query += `,`;
      query += ` ${conditions[index]} = '${req.body[conditions[index]]}'`;
      ++field;
    }
  }

  query += ` WHERE id=${id};`;

  if (field < 1)
    res.status(400).send(JSON.stringify("Bad Request"));

  else if (!checkEmailFormat(req.body["email"]))
    res.status(400).send(JSON.stringify("Bad Request"));

  else {
    executeQuery(query)
      .then(
        result => {
          executeQuery(`SELECT * FROM users WHERE id = ${id}`)
            .then(
              result => res.status(200).send(JSON.stringify(usersView(result)[0])),
              error => res.status(404).send(JSON.stringify("Note found"))
            );
        },
        error => res.status(400).send(JSON.stringify("Bad Request"))
      );
  }
});

app.delete(prefix + '/users/:id', requireSelf(), function(req, res) {
  let id = req.params.id;
  let query = `DELETE FROM users WHERE id=${id}`;

  executeDelete(`DELETE FROM cards WHERE user_id=${id}`)
    .then(
      result => {
        executeDelete(`DELETE FROM wallets WHERE user_id=${id}`)
          .then(
            result => {
              executeDelete(`DELETE FROM users WHERE id=${id}`)
                .then(
                  result => res.status(204).send(JSON.stringify("No Content")),
                  error => res.sendStatus(error));
            },
            error => res.sendStatus(error));
      },
      error => res.sendStatus(error));

});

/* =============== cards =============== */

app.get(prefix + '/cards', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = `SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards`;

  executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`)
    .then(
      result => {
        if (result[0].is_admin !== 1)
          query += ` WHERE user_id = ${result[0].id}`;
        executeQuery(query)
          .then(
            result => res.status(200).send(JSON.stringify(cardsView(result))),
            error => res.sendStatus(error));
      },
      error => res.status(401).send(JSON.stringify("Unauthorized")));
});

app.get(prefix + '/cards/:id', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let id = req.params.id;
  let query = `SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards WHERE id = ${id}`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(cardsView(result)[0])),
      error => res.sendStatus(error));
});

app.post(prefix + '/cards', function(req, res) {
  let user_id = req.body.user_id;
  let last_4 = req.body.last_4;
  let brand = req.body.brand;
  let expired_at = req.body.expired_at;

  let query = `INSERT INTO cards (user_id, last_4, brand, expired_at) VALUES ('${user_id}', '${last_4}', '${brand}', '${expired_at}')`;

  executeQuery(query)
    .then(
      result => {
        executeQuery(`SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards WHERE id = ${result.insertId}`)
          .then(
            result => res.status(200).send(JSON.stringify(cardsView(result)[0])),
            error => res.status(400).send("Bad Request")
          );
      },
      error => res.status(400).send("Bad Request")
    );
});

app.put(prefix + '/cards/:id', function(req, res) {
  let id = req.params.id;
  let query = "UPDATE cards SET";
  let conditions = ["user_id", "last_4", "brand", "expired_at"];

  for (let index in conditions) {
    if (conditions[index] in req.body) {
      if (query.indexOf("=") > 0)
        query += `,`;

      if (req.body[conditions[index]] !== undefined)
        query += ` ${conditions[index]} = '${req.body[conditions[index]]}'`;
    }
  }

  query += ` WHERE id=${id};`;

  executeQuery(query)
    .then(
      result => {
        executeQuery(`SELECT id, user_id, last_4, brand, DATE_FORMAT(expired_at, "%Y-%m-%d") AS expired_at FROM cards WHERE id = ${id}`)
          .then(
            result => res.status(200).send(JSON.stringify(cardsView(result)[0])),
            error => res.status(404).send(JSON.stringify("Note found"))
          );
      },
      error => res.status(400).send(JSON.stringify("Bad Request"))
    );


});

app.delete(prefix + '/cards/:id', function(req, res) {
  let id = req.params.id;
  let query = `DELETE FROM cards WHERE id=${id}`;

  executeQuery(query)
    .then(
      result => {
        if (result.affectedRows == 0)
          res.status(404).send(JSON.stringify("Not Found"))
        else
          res.status(204).send("No Content")
      },
      error => res.status(400).send(JSON.stringify("Bad Request"))
    );
});

/* =============== wallets =============== */

const walletsAdmin = () => {
  return (req, res, next) => {
    let access_token = req.headers["x-auth-token"];

    executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`)
      .then(
        result => {
          if (result[0].is_admin === 1)
            next();
          else {
            executeQuery(`SELECT * FROM wallets WHERE user_id = ${result[0].id}`)
              .then(
                result => {
                  walletsView(result)
                    .then(
                      result => res.status(200).send(JSON.stringify(result)),
                      error => res.status(400).send(JSON.stringify("Bad Request")));
                },
                error => res.sendStatus(error));
          }
        },
        error => res.status(500).send(JSON.stringify("Internal Server Error")));
  }
}

app.get(prefix + '/wallets', walletsAdmin(), function(req, res, next) {
  let query = `SELECT * FROM wallets`;

  executeQuery(query)
    .then(
      result => {
        walletsView(result)
          .then(
            result => res.status(200).send(JSON.stringify(result)),
            error => res.status(400).send(JSON.stringify("Bad Request"))
          );
      },
      error => res.sendStatus(error));
});

app.get(prefix + '/wallets/:id', function(req, res, next) {
  let id = req.params.id;
  let query = `SELECT * FROM wallets WHERE id = ${id}`;

  executeQuery(query)
    .then(
      result => {
        walletsView(result)
          .then(
            result => res.status(200).send(JSON.stringify(result[0])),
            error => res.status(400).send(JSON.stringify("Bad Request"))
          );
      },
      error => res.sendStatus(error));
});

/* =============== payins =============== */

const payAdmin = () => {
  return (req, res, next) => {
    let access_token = req.headers["x-auth-token"];
    let table;

    if (req.originalUrl.localeCompare(prefix + '/payins') === 0)
      table = 'payins';
    else if (req.originalUrl.localeCompare(prefix + '/payouts') === 0)
      table = 'payouts';
    else
      res.status(400).send(JSON.stringify("Bad Request"));

    executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`)
      .then(
        result => {
          if (result[0].is_admin === 1)
            next();
          else {
            executeQuery(`SELECT * FROM wallets WHERE user_id = ${result[0].id}`)
              .then(
                result => {
                  executeQuery(`SELECT * FROM ${table} WHERE wallet_id = ${result[0].id}`)
                    .then(
                      result => res.status(200).send(JSON.stringify(payView(result))),
                      error => res.status(500).send(JSON.stringify("Internal Server Error")));
                },
                error => res.status(500).send(JSON.stringify("Internal Server Error")));
          }
        },
        error => res.status(500).send(JSON.stringify("Internal Server Error")));
  }
}

app.get(prefix + '/payins', payAdmin(), function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = `SELECT * FROM payins`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(payView(result))),
      error => res.status(500).send(JSON.stringify("Internal Server Error"))
    );
});

app.get(prefix + '/payins/:id', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let id = req.params.id;
  let query = `SELECT * FROM payins WHERE id = ${id}`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(payView(result)[0])),
      error => res.status(404).send(JSON.stringify("Not Found"))
    );
});

app.post(prefix + '/payins', function(req, res) {
  let wallet_id = req.body.wallet_id;
  let amount = req.body.amount;
  let query = `INSERT INTO payins (wallet_id, amount) VALUES ('${wallet_id}', '${amount}')`;

  executeQuery(query)
    .then(
      result => {
        executeQuery(`SELECT * FROM payins WHERE id = ${result.insertId}`)
          .then(
            result => res.status(200).send(JSON.stringify(payView(result)[0])),
            error => res.status(500).send(JSON.stringify("Internal Server Error"))
          );
      },
      error => res.status(400).send(JSON.stringify("Bad Request"))
    );
});

/* =============== payouts =============== */

app.get(prefix + '/payouts', payAdmin(), function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = `SELECT * FROM payouts`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(payView(result))),
      error => res.status(500).send(JSON.stringify("Internal Server Error"))
    );
});

app.get(prefix + '/payouts/:id', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let id = req.params.id;
  let query = `SELECT * FROM payouts WHERE id = ${id}`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(payView(result)[0])),
      error => res.status(404).send(JSON.stringify("Not Found"))
    );
});

app.post(prefix + '/payouts', function(req, res) {
  let wallet_id = req.body.wallet_id;
  let amount = req.body.amount;
  let query = `INSERT INTO payouts (wallet_id, amount) VALUES ('${wallet_id}', '${amount}')`;

  executeQuery(query)
    .then(
      result => {
        executeQuery(`SELECT * FROM payouts WHERE id = ${result.insertId}`)
          .then(
            result => res.status(200).send(JSON.stringify(payView(result)[0])),
            error => res.status(500).send(JSON.stringify("Internal Server Error"))
          );
      },
      error => res.status(400).send(JSON.stringify("Bad Request"))
    );
});

/* =============== transfers =============== */

const transfersAdmin = () => {
  return (req, res, next) => {
    let access_token = req.headers["x-auth-token"];

    executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`)
      .then(
        result => {
          if (result[0].is_admin === 1)
            next();
          else {
            executeQuery(`SELECT * FROM wallets WHERE user_id = ${result[0].id}`)
              .then(
                result => {
                  executeQuery(`SELECT * FROM transfers WHERE debited_wallet_id = ${result[0].id}`)
                    .then(
                      result => res.status(200).send(JSON.stringify(transfersView(result))),
                      error => res.status(500).send(JSON.stringify("Internal Server Error")));
                },
                error => res.status(500).send(JSON.stringify("Internal Server Error")));
          }
        },
        error => res.status(500).send(JSON.stringify("Internal Server Error")));
  }
}

app.get(prefix + '/transfers', transfersAdmin(), function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let query = `SELECT * FROM transfers`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(transfersView(result)[0])),
      error => res.sendStatus(error));
});

app.get(prefix + '/transfers/:id', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let id = req.params.id;
  let query = `SELECT * FROM transfers WHERE id = ${id}`;

  executeQuery(query)
    .then(
      result => res.status(200).send(JSON.stringify(transfersView(result)[0])),
      error => res.sendStatus(error));
});

app.post(prefix + '/transfers', function(req, res) {
  let access_token = req.headers["x-auth-token"];
  let credited_wallet_id = req.body.credited_wallet_id;
  let amount = req.body.amount;

  if (amount / 100 < 1 || amount >= 99999999)
    res.status(400).send(JSON.stringify("Bad Request"))
  else {
    executeQuery(`SELECT * FROM users WHERE api_key = '${access_token}'`)
      .then(infoUser => {
          executeQuery(`SELECT * FROM wallets WHERE user_id = ${infoUser[0].id}`)
            .then(infoWallets => {
                if (infoWallets[0].id == credited_wallet_id)
                  res.status(400).send(JSON.stringify("Bad Request"));
                else {
                  executeQuery(`INSERT INTO transfers (debited_wallet_id, credited_wallet_id, amount) VALUES (${infoWallets[0].id}, ${credited_wallet_id}, ${amount})`)
                    .then(
                      result => {
                        executeQuery(`SELECT * FROM transfers WHERE id = ${result.insertId}`)
                          .then(
                            result => res.status(200).send(JSON.stringify({
                              "id": result[0].id,
                              "wallet_id": result[0].credited_wallet_id,
                              "amount": result[0].amount
                            })),
                            error => res.status(500).send(JSON.stringify("Internal Server Error"))
                          );
                      },
                      error => res.status(400).send(JSON.stringify("Bad Request")));
                }
              },
              error => res.status(500).send(JSON.stringify("Internal Server Error")));
        },
        error => res.status(500).send(JSON.stringify("Internal Server Error")));
  }
});

/* =============== errors =============== */

// 404
app.use(function(req, res, next) {
  return res.status(404).send({
    message: 'Route' + req.url + ' Not found.'
  });
});

// 500
app.use(function(err, req, res, next) {
  return res.status(500).send({
    error: err
  });
});

app.listen(port, function() {
  db.connect(function(err) {
    if (err) throw err;
    console.log('Connection to database successful!');
  });
  console.log('Watermelon listening on port ' + port);
});

process.on('uncaughtException', function(err) {
  console.log(err);
});

/* =============== utils =============== */

function executeQuery(query) {
  return new Promise(function(resolve, reject) {
    db.query(query, function(err, result, fields) {
      if (err)
        reject(err);

      else if (result.length == 0)
        reject(404);

      else {
        resolve(result);
      }
    });
  });
}

function executeDelete(query) {
  return new Promise(function(resolve) {
    let query_type = query.substring(0, 6);

    if (query_type.localeCompare("DELETE") != 0)
      resolve(400);

    else {
      executeQuery(query)
        .then(
          result => {
            if (result.affectedRows == 0)
              resolve(404);
            else
              resolve(204);
          },
          error => resolve(400));
    }
  });
}

function checkEmail(email) {
  return new Promise(function(resolve, reject) {

    if (!checkEmailFormat(email))
      reject(400);

    else {
      executeQuery(`SELECT * FROM users WHERE email = '${email}'`)
        .then(result => reject(email), error => resolve(email));
    }
  });
}

function checkEmailFormat(email) {
  let regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/i;

  if (email.match(regex) === null)
    return false;

  return true;
}

function makeid(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++)
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  return result;
}

function getBalance(wallet_id) {
  let cpt = 0;
  let balance = 0;

  return new Promise(function(resolve) {
    try {
      sumAmount(`SELECT * FROM payins WHERE wallet_id = ${wallet_id}`)
        .then(result => {
          balance += result;
          sumAmount(`SELECT * FROM payouts WHERE wallet_id = ${wallet_id}`)
            .then(result => {
              balance -= result;
              sumAmount(`SELECT * FROM transfers WHERE credited_wallet_id = ${wallet_id}`)
                .then(result => {
                  balance += result;
                  sumAmount(`SELECT * FROM transfers WHERE debited_wallet_id = ${wallet_id}`)
                    .then(result => {
                      balance -= result;
                      resolve(balance);
                    });
                });
            });
        });
    } catch (e) {
      reject(e);
    }
  });
}

function sumAmount(query) {
  let balance = 0;

  return new Promise(resolve => {
    db.query(query, function(err, result, fields) {
      if (err)
        reject(err);

      for (let index in result)
        balance += result[index].amount;

      resolve(balance);
    });
  });
}

function usersView(result) {
  let response = [];

  for (let index in result) {
    response.push({
      "id": result[index].id,
      "email": result[index].email,
      "first_name": result[index].first_name,
      "last_name": result[index].last_name,
      "is_admin": (result[index].is_admin === 1),
    });
  }
  return response;
}

function cardsView(result) {
  let response = [];

  for (let index in result) {
    response.push({
      "id": result[index].id,
      "user_id": result[index].user_id,
      "last_4": result[index].last_4,
      "brand": result[index].brand,
      "expired_at": result[index].expired_at
    });
  }
  return response;
}

function walletsView(result) {
  let response = [];

  return new Promise(async function(resolve) {
    for (let index in result) {
      let tmp = await getBalance(result[index].id);
      response.push({
        "wallet_id": result[index].id,
        "balance": tmp
      });
    }

    resolve(response);
  });
}

function payView(result) {
  let response = [];

  for (let index in result) {
    response.push({
      "id": result[index].id,
      "wallet_id": result[index].wallet_id,
      "amount": result[index].amount
    });
  }
  return response;
}

function transfersView(result) {
  let response = [];

  for (let index in result) {
    response.push({
      "id": result[index].id,
      "debited_wallet_id": result[index].debited_wallet_id,
      "credited_wallet_id": result[index].credited_wallet_id,
      "amount": result[index].amount
    });
  }
  return response;
}

function createToken(email) {
  let secretKey = fs.readFileSync('secret.key');
  let token = jwt.sign({
    email: email
  }, secretKey);

  return token;
}

function decodeJWT(token) {
  return new Promise(function(resolve, reject) {
    try {
      let secretKey = fs.readFileSync('secret.key')
      let decoded = jwt.verify(token, secretKey);
      let query = `SELECT * FROM users WHERE email='${decoded.email}'`;

      db.query(query, function(err, result, fields) {
        if (err)
          reject(500);

        if (result.length > 0)
          resolve(result);
        else
          reject(401);
      });
    } catch (e) {
      reject(401);
    }
  });
}
