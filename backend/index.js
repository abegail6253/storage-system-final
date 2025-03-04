const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');
let fileDetails = [];

require('dotenv').config();

// Initialize Express app
const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:4200',  // Allow requests from your Angular frontend
  methods: ['GET', 'POST', 'DELETE', 'PUT'],  // Allow PUT method as well
  allowedHeaders: ['Content-Type', 'Authorization'],  // Allow Authorization header
}));

// Body parser middleware
app.use(express.json());

// MySQL connection
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Developer123!@#',  // Replace with your MySQL password
  database: 'dtr_db',  // Replace with your database name
});

const promisePool = pool.promise();

// Helper function to hash passwords using sha512
function hashPassword(password) {
  return crypto.createHash('sha512').update(password).digest('hex');
}

// Ensure the uploads directory exists
const uploadDirectory = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    let originalName = file.originalname;
    const uploadPath = path.join(__dirname, 'uploads');
    let fileName = originalName;
    let fileExtension = path.extname(originalName);
    let baseName = path.basename(originalName, fileExtension);
    
    let counter = 1;
    
    // Check if the file with the same name already exists
    while (fs.existsSync(path.join(uploadPath, fileName))) {
      fileName = `${baseName} (${counter})${fileExtension}`;
      counter++;
    }

    cb(null, fileName);
  }
});

const upload = multer({ storage: storage });

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload route using multer
app.post('/upload', (req, res) => {
  console.log('Received upload request');
  
  upload.array('files')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading.
      console.error('Multer error:', err);
      return res.status(500).json({ message: 'Multer error during upload', error: err.message });
    } else if (err) {
      // An unknown error occurred when uploading.
      console.error('Unknown error during upload:', err);
      return res.status(500).json({ message: 'Unknown error during upload', error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    
    const uploadedFiles = req.files.map((file) => ({
      filename: file.filename, // Filename after renaming (including counter if necessary)
      originalname: file.originalname,
      mimetype: file.mimetype,
      path: file.path,
      size: file.size,
    }));

    console.log('Files uploaded:', uploadedFiles);
    
    // Respond with the filenames in the correct format
    res.status(200).json({
      message: 'Files uploaded successfully',
      files: uploadedFiles.map(file => ({ filename: file.filename })) // Correct format for the frontend
    });
  });
});





// Route to list all uploaded files
app.get('/files', (req, res) => {
  const filesDirectory = path.join(__dirname, 'uploads');

  // Read all files in the 'uploads' directory
  fs.readdir(filesDirectory, (err, files) => {
    if (err) {
      return res.status(500).json({ message: 'Error reading files', error: err.message });
    }

    // Map through the file names and generate file info including MIME type
    let fileDetails = files.map((file) => {
      const filePath = path.join(filesDirectory, file);
      const fileSize = fs.statSync(filePath).size; // Get file size in bytes
      const mimeType = mime.lookup(file) || 'application/octet-stream'; // Get MIME type
      const createdAt = fs.statSync(filePath).birthtime;

      return {
        filename: file,
        path: path.join('uploads', file),
        size: fileSize,  // Include the file size here
        mimeType: mimeType,  // Include MIME type here
        createdAt: createdAt,  // Include creation date here
      };
    });

    // Get query parameters for sorting and filtering
    const sortBy = req.query.sortBy || 'date';  // Default sort is by date
    const fileType = req.query.fileType || '';  // Get fileType from query, default is empty string

    // If a fileType filter is applied, filter files by MIME type
    if (fileType) {
      fileDetails = fileDetails.filter(file => file.mimeType === fileType);
    }

    // Apply sorting based on the sortBy parameter
    if (sortBy === 'date') {
      fileDetails.sort((a, b) => b.createdAt - a.createdAt); // Sort by creation date
    } else if (sortBy === 'size') {
      fileDetails.sort((a, b) => b.size - a.size); // Sort by file size
    } else if (sortBy === 'type') {
      fileDetails.sort((a, b) => a.mimeType.localeCompare(b.mimeType)); // Sort by mime type
    }

    // Calculate file statistics
    const totalFiles = fileDetails.length;
    const totalSize = fileDetails.reduce((acc, file) => acc + file.size, 0); // Sum of all file sizes in bytes

    // Respond with file details and statistics
    res.json({
      files: fileDetails,
      statistics: {
        totalFiles: totalFiles,
        totalSize: totalSize, // In bytes
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2), // Total size in MB
      }
    });
  });
});

app.get('/files/existing', (req, res) => {
  fs.readdir(uploadDirectory, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error reading directory' });
    }
    res.json({ existingFiles: files });
  });
});

app.get('/my-files/stats', (req, res) => {
  const filesDirectory = path.join(__dirname, 'uploads');

  // Read all files in the 'uploads' directory
  fs.readdir(filesDirectory, (err, files) => {
    if (err) {
      return res.status(500).json({ message: 'Error reading files', error: err.message });
    }

    // Calculate file statistics
    const totalFiles = files.length;
    const totalSize = files.reduce((acc, file) => {
      const filePath = path.join(filesDirectory, file);
      const fileSize = fs.statSync(filePath).size;
      return acc + fileSize;
    }, 0); // Sum of all file sizes in bytes

    // Respond with file statistics
    res.json({
      statistics: {
        totalFiles: totalFiles,
        totalSize: totalSize, // In bytes
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2), // Total size in MB
      }
    });
  });
});



app.get('/files/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);

  console.log(`Attempting to download file: ${filename}`);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`File not found: ${filename}`);
      return res.status(404).json({ message: 'File not found' });
    }

    console.log(`File found: ${filename}`);

    // Set the headers to force download with the correct file name
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error(`Error downloading file: ${err.message}`);
        return res.status(500).json({ message: 'Failed to download file' });
      }

      console.log(`File ${filename} downloaded successfully.`);
    });
  });
});





// Default route for testing
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.delete('/files/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // File not found
      console.error(`File not found: ${filename}`);
      return res.status(404).json({ message: 'File not found' });
    }

    // Proceed to delete the file
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
        return res.status(500).json({ message: 'Failed to delete file' });
      }
      console.log(`File ${filename} deleted successfully.`);
      res.status(200).json({ message: 'File deleted successfully' });
    });
  });
});

// Route to handle bulk deletion of files
app.post('/files/bulk-delete', async (req, res) => {
  const { filenames } = req.body; // Get filenames from the request body

  if (!filenames || filenames.length === 0) {
    return res.status(400).json({ message: 'No files selected for deletion' });
  }

  const filesDirectory = path.join(__dirname, 'uploads');

  // Loop through the filenames and delete each one
  const deletedFiles = [];
  const errors = [];

  for (const filename of filenames) {
    const filePath = path.join(filesDirectory, filename);

    try {
      // Check if the file exists
      if (fs.existsSync(filePath)) {
        // Delete the file
        fs.unlinkSync(filePath);
        deletedFiles.push(filename); // Track successfully deleted files
      } else {
        errors.push(`File not found: ${filename}`);
      }
    } catch (err) {
      errors.push(`Error deleting file ${filename}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return res.status(500).json({
      message: 'Some files could not be deleted',
      deletedFiles,
      errors,
    });
  }

  // Respond with the successfully deleted files
  res.status(200).json({
    message: 'Files deleted successfully',
    deletedFiles,
  });
});


app.put('/files/rename', (req, res) => {
  const { oldFilename, newFilename } = req.body;

  const oldFilePath = path.join(__dirname, 'uploads', oldFilename);
  const newFilePath = path.join(__dirname, 'uploads', newFilename);

  // Ensure that the new filename keeps the original file extension
  const oldFileExtension = path.extname(oldFilename); // Get the extension of the old file
  const baseNameWithoutExtension = path.basename(newFilename, oldFileExtension); // Remove the extension from the new filename

  const correctedNewFilename = baseNameWithoutExtension + oldFileExtension; // Reattach the extension to the new filename
  const correctedNewFilePath = path.join(__dirname, 'uploads', correctedNewFilename);

  // Check if a file with the new name already exists
  fs.access(correctedNewFilePath, fs.constants.F_OK, (err) => {
    if (!err) {
      return res.status(400).json({ message: 'A file with the new name already exists' });
    }

    // Rename the file
    fs.rename(oldFilePath, correctedNewFilePath, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Error renaming file', error: err.message });
      }

      console.log(`File renamed from ${oldFilename} to ${correctedNewFilename}`);
      res.status(200).json({ message: 'File renamed successfully' });
    });
  });
});




// Route to register a user
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ message: 'Username, password, and email are required' });
  }

  try {
    const [rows] = await promisePool.execute('SELECT * FROM user WHERE username = ?', [username]);

    if (rows.length > 0) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const [emailRows] = await promisePool.execute('SELECT * FROM user WHERE email = ?', [email]);

    if (emailRows.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = hashPassword(password);
    await promisePool.execute('INSERT INTO user (username, password, email) VALUES (?, ?, ?)', [username, hashedPassword, email]);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const [rows] = await promisePool.execute('SELECT * FROM user WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = rows[0];
    const hashedPassword = hashPassword(password);

    if (hashedPassword !== user.password) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '10min' }
    );

    res.json({ message: 'Login successful', token: token, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Middleware to check token validity and expiration
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized, token missing' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ message: 'Token expired or invalid' });
    }
    req.user = user;
    next();
  });
}

app.use('/user-email', authenticateToken);

// Route to get the user's email from the database
app.get('/user-email', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const [userRows] = await promisePool.execute('SELECT email FROM user WHERE id = ?', [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ email: userRows[0].email });
  } catch (err) {
    console.error('Error retrieving user email:', err);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
