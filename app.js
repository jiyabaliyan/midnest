const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const path = require('path');

const app = express();

// MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'jiya3989',
    database: 'medinest_db'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        return;
    }
    console.log('MediNest Database connected successfully.');
});

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'images')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session handling
app.use(session({
    secret: 'medinest_secure_session_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 }
}));

// Session user data available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Auth Guard Middleware
function isAuth(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
}

// ----------------- USER ROUTES -----------------

// Home
app.get('/', (req, res) => {
    res.render('home');
});

// Register
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', (req, res) => {
    const { name, mobile, aadhaar_id, password } = req.body;
    const sql = 'INSERT INTO users (name, mobile, aadhaar_id, password) VALUES (?, ?, ?, ?)';
    db.query(sql, [name, mobile, aadhaar_id, password], (err) => {
        if (err) {
            return res.render('register', { error: 'Account already registered with this ID or mobile.' });
        }
        res.redirect('/login');
    });
});

// Login
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { aadhaar_id, password } = req.body;
    const sql = 'SELECT * FROM users WHERE aadhaar_id = ? AND password = ?';
    db.query(sql, [aadhaar_id, password], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.session.user = results[0];
            res.redirect('/appointments');
        } else {
            res.render('login', { error: 'Invalid ID Number or Password.' });
        }
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Appointments
app.get('/appointments', isAuth, (req, res) => {
    db.query('SELECT * FROM doctors', (err, doctors) => {
        if (err) throw err;
        const sql = `
            SELECT a.*, d.name AS doctor_name, d.specialization 
            FROM appointments a 
            JOIN doctors d ON a.doctor_id = d.id 
            WHERE a.user_id = ? 
            ORDER BY a.appointment_date DESC`;
        db.query(sql, [req.session.user.id], (err, appointments) => {
            if (err) throw err;
            res.render('appointments', { doctors, appointments });
        });
    });
});

app.post('/appointments/book', isAuth, (req, res) => {
    const { doctor_id, appointment_date, appointment_time } = req.body;
    const sql = 'INSERT INTO appointments (user_id, doctor_id, appointment_date, appointment_time) VALUES (?, ?, ?, ?)';
    db.query(sql, [req.session.user.id, doctor_id, appointment_date, appointment_time], (err) => {
        if (err) throw err;
        res.redirect('/appointments');
    });
});

// Medical History
app.get('/medical-history', isAuth, (req, res) => {
    const sql = `
        SELECT p.*, d.name AS doctor_name 
        FROM prescriptions p 
        JOIN doctors d ON p.doctor_id = d.id 
        WHERE p.user_id = ? 
        ORDER BY p.created_at DESC`;
    db.query(sql, [req.session.user.id], (err, records) => {
        if (err) throw err;
        res.render('medical-history', { records });
    });
});

// Medicine History
app.get('/medicines', isAuth, (req, res) => {
    const sql = `
        SELECT pm.*, p.created_at, d.name AS doctor_name 
        FROM prescription_medicines pm 
        JOIN prescriptions p ON pm.prescription_id = p.id 
        JOIN doctors d ON p.doctor_id = d.id 
        WHERE p.user_id = ? 
        ORDER BY p.created_at DESC`;
    db.query(sql, [req.session.user.id], (err, medicines) => {
        if (err) throw err;
        res.render('medicines', { medicines });
    });
});

// Prescriptions
app.get('/prescriptions', isAuth, (req, res) => {
    const sql = `
        SELECT p.*, d.name AS doctor_name, d.specialization 
        FROM prescriptions p 
        JOIN doctors d ON p.doctor_id = d.id 
        WHERE p.user_id = ? 
        ORDER BY p.created_at DESC`;
    db.query(sql, [req.session.user.id], (err, prescriptions) => {
        if (err) throw err;
        res.render('prescriptions', { prescriptions });
    });
});

// Help & Support Queries
app.get('/query', isAuth, (req, res) => {
    res.render('query', { success: null });
});

app.post('/query', isAuth, (req, res) => {
    const { subject, message } = req.body;
    const sql = 'INSERT INTO queries (user_id, subject, message) VALUES (?, ?, ?)';
    db.query(sql, [req.session.user.id, subject, message], (err) => {
        if (err) throw err;
        res.render('query', { success: 'Your query has been submitted to MediNest support.' });
    });
});

// Contact Page
app.get('/contact', (req, res) => {
    res.render('contact');
});

// ----------------- DOCTOR PORTAL ROUTES -----------------

// 1. Doctor Desk: View all scheduled appointments
app.get('/doctor/portal', (req, res) => {
    const sql = `
        SELECT a.*, u.name AS patient_name, u.mobile AS patient_mobile, d.name AS doctor_name 
        FROM appointments a 
        JOIN users u ON a.user_id = u.id 
        JOIN doctors d ON a.doctor_id = d.id 
        WHERE a.status = 'Scheduled' 
        ORDER BY a.appointment_date ASC`;
    db.query(sql, (err, appointments) => {
        if (err) throw err;
        res.render('doctor-portal', { appointments });
    });
});

// 2. Consultation Page: Write prescription for an appointment
app.get('/doctor/prescribe/:appointmentId', (req, res) => {
    const sql = `
        SELECT a.*, u.name AS patient_name, d.name AS doctor_name, d.specialization 
        FROM appointments a 
        JOIN users u ON a.user_id = u.id 
        JOIN doctors d ON a.doctor_id = d.id 
        WHERE a.id = ?`;
    db.query(sql, [req.params.appointmentId], (err, results) => {
        if (err || results.length === 0) return res.redirect('/doctor/portal');
        res.render('doctor-prescribe', { data: results[0] });
    });
});

// 3. Save Prescription, Medicines, and Complete Appointment
app.post('/doctor/prescribe', (req, res) => {
    const { appointment_id, user_id, doctor_id, diagnosis, instructions, medicine_name, dosage, duration } = req.body;

    // A. Insert into prescriptions table
    const sqlPrescription = 'INSERT INTO prescriptions (user_id, doctor_id, diagnosis, instructions) VALUES (?, ?, ?, ?)';
    db.query(sqlPrescription, [user_id, doctor_id, diagnosis, instructions], (err, presResult) => {
        if (err) throw err;
        const newPrescriptionId = presResult.insertId;

        // B. Insert into prescription_medicines table
        const sqlMedicine = 'INSERT INTO prescription_medicines (prescription_id, medicine_name, dosage, duration) VALUES (?, ?, ?, ?)';
        db.query(sqlMedicine, [newPrescriptionId, medicine_name, dosage, duration], (err) => {
            if (err) throw err;

            // C. Update appointment status to Completed
            db.query('UPDATE appointments SET status = "Completed" WHERE id = ?', [appointment_id], (err) => {
                if (err) throw err;
                res.redirect('/doctor/portal');
            });
        });
    });
});

// Server Listen
app.listen(3000, () => {
    console.log('MediNest application running on http://localhost:3000');
});