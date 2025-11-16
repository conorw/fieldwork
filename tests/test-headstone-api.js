// Test script for the headstone analysis API
// This script demonstrates how to call the analyze-headstone API endpoint

const fs = require('fs');
const path = require('path');

// Example usage function
async function testHeadstoneAPI(imagePath, mimeType = 'image/jpeg') {
  try {
    // Read the image file and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Prepare the request data
    const requestData = {
      imageData: base64Image,
      mimeType: mimeType
    };

    console.log('Testing headstone analysis API...');
    console.log('Image path:', imagePath);
    console.log('Error type:', mimeType);
    console.log('Image size:', imageBuffer.length, 'bytes');
    console.log('Base64 length:', base64Image.length);

    // Make the API call
    const response = await fetch('http://localhost:3000/api/analyze-headstone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error:', errorData);
      return;
    }

    const result = await response.json();
    
    console.log('\n=== Analysis Results ===');
    console.log('Success:', result.success);
    console.log('Number of persons found:', result.persons.length);
    console.log('Metadata:', result.metadata);

    // Display details for each person found
    result.persons.forEach((person, index) => {
      console.log(`\n--- Person ${index + 1} ---`);
      console.log('Full Name:', person.full_name);
      console.log('Title:', person.title);
      console.log('Forename:', person.forename);
      console.log('Surname:', person.surname);
      console.log('Gender:', person.gender);
      console.log('Date of Birth:', person.date_of_birth);
      console.log('Date of Death:', person.date_of_death);
      console.log('Age at Death:', person.age_at_death);
      console.log('Birth Location:', `${person.birth_city || ''} ${person.birth_country || ''}`.trim());
      console.log('Veteran:', person.veteran);
      console.log('Cause of Death:', person.cause_of_death);
      console.log('Notes:', person.notes);
      console.log('Known As:', person.known_as);
      console.log('Maiden Name:', person.maiden_name);
    });

    return result;

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Example usage:
// Make sure you have a headstone image file available
const imagePath = process.argv[2];

if (!imagePath) {
  console.log('Usage: node test-headstone-api.js <path-to-image-file> [mime-type]');
  console.log('Example: node test-headstone-api.js ./sample-headstone.jpg image/jpeg');
  process.exit(1);
}

// Determine MIME type from file extension if not provided
let mimeType = process.argv[3];
if (!mimeType) {
  const ext = path.extname(imagePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      mimeType = 'image/jpeg';
      break;
    case '.png':
      mimeType = 'image/png';
      break;
    case '.webp':
      mimeType = 'image/webp';
      break;
    default:
      mimeType = 'image/jpeg'; // default
  }
}

// Run the test
testHeadstoneAPI(imagePath, mimeType)
  .then(result => {
    if (result) {
      console.log('\n✅ Test completed successfully');
    } else {
      console.log('\n❌ Test failed');
    }
  })
  .catch(error => {
    console.error('Test error:', error);
  });
