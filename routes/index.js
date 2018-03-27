const express = require('express');
const con = require('../src/db_conn');
const config = require('../conf/config');
const moment = require('moment');
const validator = require('express-validator');
const bcrypt = require('bcrypt-nodejs');
const axios = require('axios');
const flash  = require('connect-flash');

var router = express.Router();

moment().format();

router.use(validator({
  customValidators: {
    isValidDate: isValidDate
  }
}))

function isValidDate(value) {
  if (!value.match(/^\d{4}-\d{2}-\d{2}$/)) return false;
  var years = moment().diff(value, 'years')
  if (years <= 18) return false;

  const date = new Date(value);
  if (!date.getTime()) return false;
  return date.toISOString().slice(0, 10) === value;
}

router.get('/', function(req, res) {
  res.render('home')
})

router.get('/form', function(req, res) {
  res.render('form')
})

router.get('/student/', function(req, res, next) {
  if(req.query.keyword === undefined || req.query.sort === undefined || req.query.by === undefined ) {
    var by = 'id_student';
    var keyword = '';
    var sort = 'desc';
  } else {  
    var by = req.query.by;
    var key = req.query.keyword;
    var keyword = key.toString();
    var sort = req.query.sort;
  }
  var query = con.query("SELECT * FROM student WHERE ?? LIKE CONCAT('%', ? ,'%') ORDER BY ?? "+sort, [by, keyword, by], function(err, rows, fields) {
    if (err) {
      res.status(500).json({"status_code": 500,"status_message": "internal server error"});
    } else {
      res.render('index', {title: 'STUDENT LIST', data:rows, skeyword: keyword, ssort: sort, sby: by});
    }
  });
  console.log(query.sql)
});

router.get('/adminlist', function(req, res) {
  con.query('SELECT * FROM users ORDER BY id', function(err, rows, fields) {
    if (err) {
      res.status(500).json({"status_code": 500,"status_message": "internal server error"});
    } else {
      res.render('adminlist', {title: 'ADMIN LIST', data: rows});
    }
  });
});

router.get('/addadmin', function(req, res){
  res.render('addadmin');
});

router.post('/addadmin', function(req, res) {
  req.checkBody("username",'input name').notEmpty();  
  req.checkBody("email",'input email').notEmpty();  
  req.checkBody("password",'input password').notEmpty();  
  req.checkBody("email", "Enter a valid EMAIL.").isEmail();
  var errors = req.validationErrors();
  if (errors) {
    res.render('addadmin', { errors: errors , susername: req.body.username, semail:req.body.email });
    return;
  } else {
    var sql =  "SELECT username FROM users WHERE username = " + con.escape(req.body.username);
    con.query(sql,  function(err, rows) {
      if (rows.length > 0) {
        req.flash('error1', 'Duplicate username');
        return res.render('addadmin',{'error1' :req.flash('error1'), susername: req.body.username, semail: req.body.email });       
      } else {
        var sql = "SELECT email FROM users WHERE email = " + con.escape(req.body.email);
        con.query(sql, function(err, rows) {
          if (rows.length > 0) {
            req.flash('error2', 'Duplicate email');
            return res.render('addadmin',{'error2' :req.flash('error2'), susername: req.body.username, semail: req.body.email });         
          } else {
            var SALT_FACTOR = 5;
            var ssusername= req.body.username;
            var ssemail= req.body.email;
            var sspassword= req.body.password;

            bcrypt.genSalt(SALT_FACTOR, function(err, salt) {
              if (err) return next(err);
        
              bcrypt.hash(sspassword, salt, null, function(err, hash) {
                if (err) return next(err);
                var sspassword = hash;
                var user = {username: ssusername, email: ssemail, password: sspassword}
                var sql = "INSERT INTO users SET ?"
                con.query(sql, user, function(err, rows) {
                  if (err) throw err;
                    req.flash('info', 'Success adding');
                    res.render('addadmin',{'info' :req.flash('info')})
                    console.log(rows);
                });
              });
            });
          }
        });
      }
    });
  };
});   

router.post('/deleteadmin/:id', function (req, res) {
  var sql = 'DELETE FROM users WHERE id = ?';
  con.query(sql, [req.params.id], function(err, result) {
    if(err) throw err
    res.redirect('/adminlist');
  });
});

router.get('/logout', function (req, res) {
  if(!req.isAuthenticated()) {
     notFound404(req, res, next);
  } else {
     req.logout();
     res.redirect('/login');
  }
})

router.post('/', function (req, res) {
  req.checkBody("name",'input name').notEmpty();  
  req.checkBody("email", "Enter a valid EMAIL.").isEmail();
  req.checkBody("dob", 'Invalid Date / You need to be atleast 18 years old').isValidDate();
  var errors = req.validationErrors();
  if (errors) {
    res.render('form', { errors: errors , saddress: req.body.address, sname:req.body.name , semail:req.body.email, sdob: req.body.dob, sgender: req.body.gender });
    return;
  } else {
    var createStudent = {
      name: req.body.name,
      address: req.body.address,
      gender: req.body.gender,
      dob: req.body.dob,
      email: req.body.email,
      adm_date: new Date()
      }

    con.query('INSERT INTO student SET ?', createStudent, function (err, resp) {
      if (err) throw err;
      res.redirect('/student')
    });  
  }
});

router.post('/update/:id', function(req, res) {
  req.checkBody("name",'input name').notEmpty();  
  req.checkBody("email", "Enter a valid EMAIL.").isEmail();
  req.checkBody("dob", 'Invalid Date / You need to be atleast 18 years old').isValidDate();
  var errors = req.validationErrors();
  if (errors) {
    con.query('SELECT * FROM student WHERE id_student = ?', [req.params.id], function(err, rows, fields) {
      if(err) throw err
        res.render('edit', { errors: errors,
        sid: rows[0].id_student,
        saddress: req.body.address, sname:req.body.name , semail:req.body.email, sdob: req.body.dob, sgender: req.body.gender     
        });
    });
  } else {
    var studentId = req.body.id_student;  
    var studentName = req.body.name;
    var studentAddress = req.body.address;
    var studentGender = req.body.gender;
    var studentDoB = req.body.dob;
    var studentEmail = req.body.email;
    var postData  = {id_student: studentId, name: studentName, address: studentAddress, gender: studentGender, dob: studentDoB, email: studentEmail};

    if(studentId !== undefined && studentId !== '') {
      con.query('UPDATE student SET id_student = ?, name = ?, address = ?, gender = ?, dob = ? , email = ? WHERE id_student = ?', [studentId, studentName, studentAddress, studentGender, studentDoB, studentEmail, studentId], function (error, results, fields) {
        if (error) throw error;
        res.redirect('/student');
      });
    } else {
      con.query('INSERT INTO student SET ?', postData, function (error, results, fields) {
        if (error) throw error;
        res.redirect('/student');
      });
    }
  }
});

router.get('/student/:id', function(req, res){
  con.query('SELECT * FROM student WHERE id_student = ?', [req.params.id], function(err, rows, fields) {
    if(err) throw err

    if (rows.length <= 0) {
      req.flash('error', 'Student not found with id = ' + req.params.id)
      res.redirect('/student')
    } else { 
      var studentDoB = moment(rows[0].dob).format('YYYY-MM-DD')
      console.log(studentDoB)
      res.render('edit', {
          title: 'Edit Student', 
          //data: rows[0],
          sid: rows[0].id_student,
          sname: rows[0].name,
          saddress: rows[0].address,
          sgender: rows[0].gender,
          sdob: studentDoB,
          semail: rows[0].email
      })
    }            
  });
});

router.post('/delete/:id', function (req, res, next) {
  con.query('DELETE FROM student WHERE id_student = ?', [req.params.id], function(err, result) {
    if(err) throw err
    console.log(result);
    res.redirect('/student');
  });
});


function adapt(original) {
  var copy = [];
  for (var i = 0; i < original.length; ++i) {
    for (var j = 0; j < original[i].length; ++j) {
      // skip undefined values to preserve sparse array
      if (original[i][j] === undefined) continue;
      // create row if it doesn't exist yet
      if (copy[j] === undefined) copy[j] = [];
      // swap the x and y coords for the copy
      copy[j][i] = original[i][j];
    }
  }
  return copy;
}

router.get('/stat/',function(req, res)  {
  var getmonth = []; getfrek = []; temp_monthfrek=[]; trans_month=[]; getgender = []; getfrekgen = []; temp_genderfrek=[]; trans_gend=[]; val = [];
  var thn = 2018;
  if (req.query.thn === undefined) {
    var thn = 2018;
  } else {
    var thn = req.query.thn
  }
  con.query("select month(adm_date) as month, count(*) as Frek from student where year(adm_date)= "+thn+" group by month(adm_date)", function(err, rows, fields) {
    if (err) {
      console.log(err)
    } else {
      getmonth.push('MONTH','January','February', 'March', 'April', 'May', 'June', 'July', 'August','September','October','November','December')
      getfrek.push('FREKUENSI',0,0,0,0,0,0,0,0,0,0,0,0)
      for (var j = 0 ; j < rows.length ; j++) {
        if (rows[j].month === 1) {
          getfrek.splice(1,1,rows[j].Frek)
        } else if (rows[j].month === 2) {
          getfrek.splice(2,1,rows[j].Frek)
        } else if (rows[j].month === 3) {
          getfrek.splice(3,1,rows[j].Frek)
        } else if (rows[j].month === 4) {
          getfrek.splice(4,1,rows[j].Frek)
        } else if (rows[j].month === 5) {
          getfrek.splice(5,1,rows[j].Frek)
        } else if (rows[j].month === 6) {
          getfrek.splice(6,1,rows[j].Frek)
        } else if (rows[j].month === 7) {
          getfrek.splice(7,1,rows[j].Frek)
        } else if (rows[j].month === 8) {
          getfrek.splice(8,1,rows[j].Frek)
        } else if (rows[j].month === 9) {
          getfrek.splice(9,1,rows[j].Frek)
        } else if (rows[j].month === 10) {
          getfrek.splice(10,1,rows[j].Frek)
        } else if (rows[j].month === 11) {
          getfrek.splice(11,1,rows[j].Frek)
        } else {
          getfrek.splice(12,1,rows[j].Frek)
        }          
      }
      temp_monthfrek.push(getmonth,getfrek)
    }
    var trans_month = adapt(temp_monthfrek);  

    con.query('SELECT gender, count(gender) as frek_gend FROM student GROUP BY gender', function(err, rows, fields) {
      if (err) {
        console.log(err)
      } else {
        for (var j = 0 ; j < rows.length ; j++) {
          if (rows[j].gender === 'f') {
            getgender.push('FEMALE')
          } else {
            getgender.push('MALE')
          }
          getfrekgen.push(rows[j].frek_gend)       
        }
        temp_genderfrek.push(getgender,getfrekgen)
      }
      var trans_gend = adapt(temp_genderfrek);  

      con.query('SELECT year(adm_date) as year from student group by year(adm_date);', function(err, rows, fields) {
        for (j = 0; j < rows.length; j++) {
          val.push(rows[j].year)
        }
        res.render('stat',{obj1: JSON.stringify(temp_monthfrek), obj2: JSON.stringify(trans_gend), obj3: val, sval: thn});
      })
    })  
  })  
});



module.exports = router;
