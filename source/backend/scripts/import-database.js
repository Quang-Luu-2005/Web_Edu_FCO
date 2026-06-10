require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('../models/LocalUser.model');
require('../models/Lecturer.model');
require('../models/CourseCategory.model');
require('../models/CourseTopic.model');
require('../models/Course.model');
require('../models/CourseClass.model');
require('../models/PracticeClass.model');
require('../models/TopWeek.model');
require('../models/VerificationRequest.model');
require('../models/SupportTicket.model');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'database');

const COLLECTION_BY_FILE = {
  admins: 'localusers',
  facebookusers: 'localusers',
  localusers: 'localusers',
  lecturers: 'lecturers',
  coursecategories: 'coursecategories',
  coursetopics: 'coursetopics',
  courses: 'courses',
  courseclasses: 'courseclasses',
  practiceclasses: 'practiceclasses',
  topweeks: 'topweeks',
  verificationrequests: 'verificationrequests',
  supporttickets: 'supporttickets',
};

const args = process.argv.slice(2);
const options = {
  dir: DEFAULT_DATA_DIR,
  only: process.env.IMPORT_ONLY
    ? process.env.IMPORT_ONLY.split(',').map(item => item.trim()).filter(Boolean)
    : process.env.npm_config_only
    ? process.env.npm_config_only.split(',').map(item => item.trim()).filter(Boolean)
    : null,
  dryRun: process.env.DRY_RUN === 'true',
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dir') options.dir = path.resolve(args[++i]);
  else if (arg === '--only') options.only = args[++i].split(',').map(item => item.trim()).filter(Boolean);
  else if (arg === '--dry-run') options.dryRun = true;
}

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const convertMongoExportValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(convertMongoExportValue);
  }

  if (!isObject(value)) {
    return value;
  }

  const keys = Object.keys(value);
  if (keys.length === 1 && typeof value.$oid === 'string') {
    return new mongoose.Types.ObjectId(value.$oid);
  }

  if (keys.length === 1 && value.$date) {
    return new Date(value.$date);
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = convertMongoExportValue(item);
  }
  return output;
};

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  return JSON.parse(raw);
};

const unwrapMongoCommand = (payload, fallbackCollection) => {
  if (Array.isArray(payload)) {
    if (payload.length === 1 && isObject(payload[0]) && payload[0].insert && Array.isArray(payload[0].documents)) {
      return {
        collection: payload[0].insert,
        documents: payload[0].documents,
      };
    }
    return {
      collection: fallbackCollection,
      documents: payload,
    };
  }

  if (isObject(payload) && payload.insert && Array.isArray(payload.documents)) {
    return {
      collection: payload.insert,
      documents: payload.documents,
    };
  }

  return {
    collection: fallbackCollection,
    documents: [payload],
  };
};

const importDocuments = async (collectionName, documents) => {
  const collection = mongoose.connection.db.collection(collectionName);
  const cleanDocs = documents
    .map(convertMongoExportValue)
    .filter(doc => doc && !doc.insert && !doc.documents);

  if (cleanDocs.length === 0) {
    return { imported: 0, removedBadWrappers: 0 };
  }

  if (options.dryRun) {
    const badWrapperCount = await collection.countDocuments({
      insert: collectionName,
      documents: { $exists: true },
    });
    return {
      imported: cleanDocs.length,
      removedBadWrappers: badWrapperCount,
      dryRun: true,
    };
  }

  const badDelete = await collection.deleteMany({
    insert: collectionName,
    documents: { $exists: true },
  });

  const operations = cleanDocs.map(doc => {
    if (doc._id) {
      return {
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      };
    }
    return {
      insertOne: {
        document: doc,
      },
    };
  });

  const result = await collection.bulkWrite(operations, { ordered: false });
  return {
    imported: cleanDocs.length,
    inserted: result.insertedCount || 0,
    upserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
    removedBadWrappers: badDelete.deletedCount,
  };
};

const main = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI in source/backend/.env');

  const files = fs.readdirSync(options.dir)
    .filter(file => file.endsWith('.json'))
    .filter(file => {
      if (!options.only) return true;
      const baseName = path.basename(file, '.json');
      return options.only.includes(baseName) || options.only.includes(COLLECTION_BY_FILE[baseName]);
    })
    .sort();

  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true,
    serverSelectionTimeoutMS: 10000,
  });

  for (const file of files) {
    const filePath = path.join(options.dir, file);
    const baseName = path.basename(file, '.json');
    const fallbackCollection = COLLECTION_BY_FILE[baseName] || baseName;
    const payload = readJsonFile(filePath);
    const { collection, documents } = unwrapMongoCommand(payload, fallbackCollection);
    const summary = await importDocuments(collection, documents);
    console.log(`[import] ${file} -> ${collection}: ${JSON.stringify(summary)}`);
  }

  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error('[import] failed:', err.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
