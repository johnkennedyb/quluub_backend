const { sqlQuery } = require('../config/sql');
const { v4: uuidv4 } = require('uuid');

function toAppUser(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    fname: row.fname,
    lname: row.lname,
    gender: row.gender,
    plan: row.plan,
    premiumExpirationDate: row.premiumExpirationDate || null,
    type: row.type,
    dob: row.dob || null,
    country: row.country || null,
    city: row.city || null,
    ethnicity: row.ethnicity || null,
    lastSeen: row.lastSeen || null,
    status: row.status,
    hidden: row.hidden === 1 || row.hidden === true || row.hidden === '1' ? true : !!row.hidden,
    waliDetails: row.waliDetails || null,
  };
}

async function findByUsernameOrEmail(identifier) {
  const rows = await sqlQuery(
    'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
    [identifier, identifier]
  );
  return toAppUser(rows[0]);
}

async function findByEmail(email) {
  const rows = await sqlQuery('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return toAppUser(rows[0]);
}

async function findByUsername(username) {
  const rows = await sqlQuery('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  return toAppUser(rows[0]);
}

async function findById(id) {
  const rows = await sqlQuery('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return toAppUser(rows[0]);
}

function pickInsert(data) {
  return {
    id: data.id || data._id || uuidv4(),
    username: data.username,
    email: data.email,
    password: data.password,
    fname: data.fname,
    lname: data.lname,
    gender: data.gender,
    dob: data.dob || null,
    country: data.country || null,
    region: data.region || null,
    height: data.height || null,
    weight: data.weight || null,
    build: data.build || null,
    appearance: data.appearance || null,
    maritalStatus: data.maritalStatus || null,
    noOfChildren: data.noOfChildren || null,
    ethnicity: Array.isArray(data.ethnicity) ? JSON.stringify(data.ethnicity) : data.ethnicity || null,
    nationality: data.nationality || null,
    sect: data.sect || null,
    scholarsSpeakers: data.scholarsSpeakers || null,
    dressingCovering: data.dressingCovering || null,
    islamicPractice: data.islamicPractice || null,
    genotype: data.genotype || null,
    summary: data.summary || null,
    workEducation: data.workEducation || null,
    traits: data.traits || null,
    openToMatches: data.openToMatches || null,
    dealbreakers: data.dealbreakers || null,
    icebreakers: data.icebreakers || null,
    waliDetails: data.waliDetails || null,
    hidden: typeof data.hidden === 'boolean' ? data.hidden : !!data.hidden,
    type: data.type || 'USER',
    status: data.status || 'NEW',
    plan: data.plan || 'freemium',
    lastSeen: data.lastSeen || new Date(),
  };
}

async function createUser(data) {
  const ins = pickInsert(data);
  const cols = Object.keys(ins);
  const placeholders = cols.map(() => '?').join(',');
  const values = cols.map((k) => ins[k]);
  await sqlQuery(`INSERT INTO users (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${placeholders})`, values);
  const rows = await sqlQuery('SELECT * FROM users WHERE id = ? LIMIT 1', [ins.id]);
  return toAppUser(rows[0]);
}

async function updateById(id, updates) {
  const allowed = [
    'username','email','password','fname','lname','gender','dob','country','region','height','weight','build','appearance','maritalStatus','noOfChildren','ethnicity','nationality','sect','scholarsSpeakers','dressingCovering','islamicPractice','genotype','summary','workEducation','traits','openToMatches','dealbreakers','icebreakers','waliDetails','hidden','type','status','plan','lastSeen','premiumExpirationDate'
  ];
  const entries = Object.entries(updates).filter(([k,v]) => allowed.includes(k));
  if (!entries.length) return (await sqlQuery('SELECT * FROM users WHERE id = ? LIMIT 1', [id]))[0] || null;
  const setSql = entries.map(([k]) => `\`${k}\` = ?`).join(', ');
  const params = entries.map(([,v]) => (Array.isArray(v) ? JSON.stringify(v) : v));
  params.push(id);
  await sqlQuery(`UPDATE users SET ${setSql} WHERE id = ?`, params);
  const rows = await sqlQuery('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return toAppUser(rows[0]);
}

async function upsertFromMongo(mongoUser) {
  const existing = await findByEmail(mongoUser.email);
  if (!existing) {
    return createUser({
      id: mongoUser._id?.toString(),
      username: mongoUser.username,
      email: mongoUser.email,
      password: mongoUser.password,
      fname: mongoUser.fname,
      lname: mongoUser.lname,
      gender: mongoUser.gender,
      dob: mongoUser.dob,
      country: mongoUser.country,
      region: mongoUser.region,
      ethnicity: mongoUser.ethnicity,
      summary: mongoUser.summary,
      workEducation: mongoUser.workEducation,
      traits: mongoUser.traits,
      openToMatches: mongoUser.openToMatches,
      dealbreakers: mongoUser.dealbreakers,
      icebreakers: mongoUser.icebreakers,
      waliDetails: mongoUser.waliDetails,
      type: mongoUser.type,
      status: mongoUser.status,
      plan: mongoUser.plan,
      lastSeen: mongoUser.lastSeen || new Date()
    });
  } else {
    return updateById(existing._id, {
      username: mongoUser.username,
      password: mongoUser.password,
      fname: mongoUser.fname,
      lname: mongoUser.lname,
      gender: mongoUser.gender,
      dob: mongoUser.dob,
      country: mongoUser.country,
      region: mongoUser.region,
      ethnicity: mongoUser.ethnicity,
      summary: mongoUser.summary,
      workEducation: mongoUser.workEducation,
      traits: mongoUser.traits,
      openToMatches: mongoUser.openToMatches,
      dealbreakers: mongoUser.dealbreakers,
      icebreakers: mongoUser.icebreakers,
      waliDetails: mongoUser.waliDetails,
      type: mongoUser.type,
      status: mongoUser.status,
      plan: mongoUser.plan,
      lastSeen: mongoUser.lastSeen || new Date()
    });
  }
}

async function listRecentlyActive(sinceDate) {
  const rows = await sqlQuery('SELECT * FROM users WHERE lastSeen >= ? ORDER BY lastSeen DESC', [sinceDate]);
  return rows.map(toAppUser);
}

module.exports = {
  findByUsernameOrEmail,
  findByEmail,
  findByUsername,
  findById,
  createUser,
  updateById,
  upsertFromMongo,
  listRecentlyActive,
};
