require("./utils.js");

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const app = express();

const Joi = require("joi");

const port = process.env.PORT || 3000;

// expires in 1 hour
const expireTime = 1000 * 60 * 60;

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;

var { database } = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');

app.use(express.urlencoded({ extended: false }));

var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
    crypto: {
        secret: mongodb_session_secret
    }
})

app.use(session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store 
    saveUninitialized: false,
    resave: true
}
));

function isValidSession(req) {
    if (req.session.authenticated) {
        return true;
    }
    return false;
}

function sessionValidation(req,res,next) {
    if (isValidSession(req)) {
        next();
    }
    else {
        res.redirect('/login');
    }
}


function isAdmin(req) {
    if (req.session.user_type == 'admin') {
        return true;
    }
    return false;
}

function adminAuthorization(req, res, next) {
    if (!isAdmin(req)) {
        res.status(403);
        res.render("loginError.ejs", {error: "Not Authorized"});
        return;
    }
    else {
        next();
    }
}

app.get('/', (req, res) => {
    if (req.session.authenticated) {
        res.render('indexLoggedIn.ejs', { name: req.session.username });
    } else {
        res.render('index.ejs');
    }
});

app.get('/members', (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/');
    } else {
        const randomImage = Math.floor(Math.random() * 3) + 1;
        res.render('members.ejs', { name: req.session.username, image: randomImage });
    }
});

app.get('/createUser', (req, res) => {
    res.render("createUser.ejs");
});


app.get('/login', (req, res) => {
    res.render("login.ejs");
});

app.post('/submitUser', async (req, res) => {
    var username = req.body.username;
    var email = req.body.email;
    var password = req.body.password;

    const schema = Joi.object(
        {
            username: Joi.string().alphanum().max(20).required(),
            email: Joi.string().email().required(),
            password: Joi.string().max(20).required()
        });

    const validationResult = schema.validate({ username, email, password });
    if (validationResult.error != null) {
        const errorMessage = validationResult.error.details[0].message;
        res.render("createUserError.ejs", { error: errorMessage });
        return;
    }

    var hashedPassword = await bcrypt.hash(password, saltRounds);

    await userCollection.insertOne({ username: username, email, password: hashedPassword, user_type: "user" });
    console.log("Inserted user");

    res.redirect('/members');
});

app.post('/loggingin', async (req, res) => {
    var email = req.body.email;
    var password = req.body.password;

    const schema = Joi.string().max(20).required();
    const validationResult = schema.validate(email);
    if (validationResult.error != null) {
        const errorMessage = validationResult.error.details[0].message;
        console.log(validationResult.error);
        res.render("loginError.ejs", { error: errorMessage });
        return;
    }

    const result = await userCollection.findOne({ email });

    console.log(result);
    if (!result) {
        console.log("user not found");
        res.render("loginError.ejs", { error: "invalid email" });
        return;
    }
    if (await bcrypt.compare(password, result.password)) {
        console.log("correct password");
        req.session.authenticated = true;
        req.session.username = result.username;
        req.session.user_type = result.user_type;
        req.session.cookie.maxAge = expireTime;

        res.redirect('/members');
        return;
    }
    else {
        console.log("incorrect password");
        res.render("loginError.ejs", { error: "incorrect password" });
        return;
    }
});

app.use('/loggedin', sessionValidation);
app.get('/loggedin', (req,res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    res.render("loggedin");
});

app.get('/admin', sessionValidation, adminAuthorization, async (req,res) => {
    const result = await userCollection.find().project({username: 1, _id: 1}).toArray();
 
    res.render("admin.ejs", {users: result});
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
    res.status(404);
    res.render("404.ejs");
})

app.listen(port, () => {
    console.log("Node application listening on port " + port);
});

