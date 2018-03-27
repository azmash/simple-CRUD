const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt-nodejs');
const async = require('async');
const con = require('../src/db_conn');
const sgMail = require('@sendgrid/mail');
const flash  = require('connect-flash');
const crypto = require('crypto');
const moment = require('moment');
const passport = require('passport');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);


router.get('/forgot', function(req, res){
  if (req.isAuthenticated()) {
    res.redirect('/');
  } else {
    res.render('login/forgot',{'message' :req.flash('message')});
  };
});

router.get('/login', function(req, res){
  if (req.isAuthenticated()) {
    res.redirect('/');
  } else {
  res.render('login/index',{'message' :req.flash('message')});
  };
});

router.post("/signin", passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}), function(req, res, info){
  res.render('home',{'message' :req.flash('message'), username :req.user.username});
});

router.post('/forgot', function(req, res, next) {
  var email = req.body.email;
  async.waterfall([
    function(done) {
      crypto.randomBytes(20, function(err, buf) {
        var token = buf.toString('hex');
        done(err, token);
      });
    },

    function(token, done) {
      console.log(email);
      var sql = "SELECT * FROM users WHERE email = " + con.escape(email);
      con.query(sql, function(err, rows) {
        if (rows.length <= 0) {
          req.flash('error', 'No account with that email address exists.');
          return res.render('login/forgot',{'error' :req.flash('error')});
        }
        var spw_token = token;      
        var spw_exp = moment().toDate();
        var reset = {pw_token: spw_token, pw_exp: spw_exp}
        var sql = "UPDATE users SET ? WHERE email = ? ";
        con.query(sql, [reset, email], function(err,rows) {
          done(err, token, rows);
          console.log('rows',rows);
        });
      });
    },
    
    function(token, rows, done) {
      var msge = {
        to: email,
        from: 'azz@example.com',
        subject: 'Node.js Password Reset',
        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
        'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
        'http://' + req.headers.host + '/reset/' + token + '\n\n' +
        'If you did not request this, please ig-nore this email and your password will remain unchanged.\n',
      };
      sgMail.send(msge, function(err) {
        req.flash('info', 'An e-mail has been sent to ' + email + ' with further instructions.');
        done(err, 'done');
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.render('login/forgot',{'info' :req.flash('info')});
  });
});

router.get('/reset/:token', function(req, res) {
  var sql = 'select * from users where pw_token = ?';
  con.query(sql ,[req.params.token], function (err, rows, fields) {
    if(err) throw err

    if (rows.length <= 0) {
      req.flash('error', 'Password reset token is invalid');
      return res.render('login/forgot', {'error' :req.flash('error')});
    }
    console.log(rows[0].pw_exp);
    var min = moment().diff(rows[0].pw_exp, 'minute')
    console.log(min);

    if (min >=160) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.render('login/forgot', {'error' :req.flash('error')});
    }
    var username = rows[0].username
    res.render('login/reset', {
      susername: username
    }); 
  });
});

router.post('/reset/:token', function(req, res, next) {
  var username = req.body.username;
  console.log(username)
  async.waterfall([
    function(done) {
      var sql = "SELECT * FROM users WHERE pw_token = ?";
      con.query(sql , [req.params.token], function(err, rows) {
        if (rows.length <= 0) {
          req.flash('error', 'No account with that email address exists.');
          return res.render('login/forgot',{'error' :req.flash('error')});
        }
        var spw_token = undefined;      
        var spw_exp = undefined;  
        var spassword = req.body.password;  
        var sspassword = bcrypt.hashSync(spassword);
        
        var reset = {pw_token: spw_token, pw_exp: spw_exp, password: sspassword}
        var sql = "UPDATE users SET ? WHERE username = ? ";
        con.query(sql, [reset, username], function(err,rows) {        
          });  
        var sql = "SELECT email FROM users WHERE username = " + con.escape(username);
        con.query(sql, function(err,rows) {
            var email = rows[0].email;
            done(err, rows);
        });
      });
    },
    
    function(rows, done) {
      var msge = {
        to: rows[0].email,
        from: 'vy.phera@gmail.com',
        subject: 'Your password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + rows[0].email + ' has just been changed.\n'
      };
      sgMail.send(msge, function(err) {
        req.flash('success', 'Success! Your password has been changed.');
        done(err, 'done');
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.render('login/index',{'success' :req.flash('success')});
  });
});

module.exports = router;
