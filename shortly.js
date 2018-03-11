var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session')
var bcrypt = require('bcrypt');



var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(session({
  secret: 'keyboard cat',
  cookie: {}
}));

function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
}

app.get('/',
function(req, res) {
  res.render('login');
});

app.get('/create', restrict, function(req, res) {
  res.render('index');
});

app.get('/links', restrict, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', restrict, function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});


/************************************************************/
// Write your authentication routes here
/************************************************************/

// Authenticate HERE!!
app.post('/login', function(req, res) {
  console.log(req.body)
  var username = req.body.username;
  var password = req.body.password;

  new User({username: username}).fetch().then(function(user) {
    if(user) {
      var salt = user.attributes.salt;
      var hash = bcrypt.hashSync(password, salt);

      if (user.attributes.password === hash) {
        res.send(200, 'Logged in')
      } else {
        res.send(400, 'Incorrect credentials')
      }
    }
    res.send(400, 'Incorrect credentials')
    //console.log('Here is the ', user.attributes.salt);
  })

  if(username == 'demo' && password == 'demo'){
    req.session.regenerate(function(){
      req.session.user = username;
      res.redirect('/create');
    });
  }
  else {
    // console.log('here')
    // res.redirect('login');
  }
});

// Server Signup HTML
app.get('/signup',
function(req, res) {
  res.render('signup');
});


// Creates new user
app.post('/signup', function(req, res) {
  new User({username: req.body.username}).fetch().then(function(model){
    if(model){
      res.send(400, 'User already exists')
    } else {
      var salt = bcrypt.genSaltSync(10);
      var hash = bcrypt.hashSync(req.body.password, salt);
      console.log(hash)
      new User({
        username: req.body.username,
        password: hash,
        salt: salt
      })
      .save()
      .then(function(model) {
        res.send(201);
      });
    }
  })

});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
