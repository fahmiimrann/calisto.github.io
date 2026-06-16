// Storage abstraction. Three interchangeable backends, chosen at boot:
//
//   1. Supabase  — when SUPABASE_URL + SUPABASE_SERVICE_KEY are set.
//   2. MySQL     — when DB_BACKEND=mysql (or MYSQL_DATABASE is set) and
//                  Supabase is not configured. Used by the calisto.co
//                  production server, which ships MySQL only.
//   3. Local JSON files in `./data` — zero-config fallback for dev.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

// MySQL is selected explicitly via DB_BACKEND=mysql, or implicitly when a
// MYSQL_DATABASE is provided and Supabase is not in play. mysql2 is required
// lazily so machines without it (and without MySQL configured) still boot.
const useMysql = !useSupabase &&
    (String(process.env.DB_BACKEND || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_DATABASE);

const supabase = useSupabase
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

// --- MySQL connection pool (lazy) ------------------------------------------
let mysqlPool = null;
function getMysqlPool() {
    if (mysqlPool) return mysqlPool;
    const mysql = require('mysql2/promise');
    mysqlPool = mysql.createPool({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 5,
        charset: 'utf8mb4'
    });
    return mysqlPool;
}

// Records carry a few object/array fields (features) plus a potentially large
// base64 fundus image. We serialise objects to JSON on the way in and parse
// them back on the way out so the rest of the app keeps working with plain
// JS objects regardless of backend.
function rowToRecord(row) {
    if (!row) return null;
    const out = { ...row };
    if (typeof out.features === 'string') {
        try { out.features = JSON.parse(out.features); } catch (_) { /* leave as-is */ }
    }
    return out;
}

function recordToRow(record) {
    const row = { ...record };
    if (row.features !== undefined && row.features !== null && typeof row.features !== 'string') {
        row.features = JSON.stringify(row.features);
    }
    return row;
}

// --- Seed data -------------------------------------------------------------
const SEED_USERS = [
    { id: 'u-1', username: '1',      password: '1',        name: 'Fahmi',            type: 'intern', email: 'fahmi@calisto.com',  avatar: '', created_at: '2026-04-01T00:00:00.000Z' },
    { id: 'u-2', username: 'doctor', password: 'ocularxr', name: 'Dr. Julian Voss',  type: 'doctor', email: 'julian@calisto.com', avatar: '', created_at: '2026-04-01T00:00:00.000Z' },
    { id: 'u-3', username: 'nurse',  password: 'nurs3',    name: 'Nurse Meera Syed', type: 'nurse',  email: 'meera@calisto.com',  avatar: '', created_at: '2026-04-01T00:00:00.000Z' }
];

const SEED_RECORDS = [
    { id: 'OCU-H00001',   patient: 'Siti Aminah',     age: 54, gender: 'Female', date: '2026-04-18', result: 'Healthy',              confidence: '98.1%', doctor: 'Nurse Meera Syed', severity: 'Healthy'  },
    { id: 'OCU-G00001',   patient: 'Tan Wei',         age: 48, gender: 'Male',   date: '2026-04-20', result: 'Glaucoma',             confidence: '90.8%', doctor: 'Dr. Julian Voss',  severity: 'Critical' },
    { id: 'OCU-AMD00001', patient: 'Paul Garnier',    age: 72, gender: 'Male',   date: '2026-04-24', result: 'AMD',                  confidence: '91.6%', doctor: 'Dr. Julian Voss',  severity: 'Moderate' },
    { id: 'OCU-DR00001',  patient: 'Aliyah Rahman',   age: 59, gender: 'Female', date: '2026-04-26', result: 'Diabetic Retinopathy', confidence: '82.0%', doctor: 'Nurse Meera Syed', severity: 'Critical' },
    { id: 'OCU-H00002',   patient: 'Sarah Miller',    age: 26, gender: 'Female', date: '2026-04-27', result: 'Healthy',              confidence: '98.8%', doctor: 'Dr. Julian Voss',  severity: 'Healthy'  },
    { id: 'OCU-G00002',   patient: 'Marcus Chen',     age: 41, gender: 'Male',   date: '2026-04-28', result: 'Early Glaucoma',       confidence: '87.4%', doctor: 'Dr. Julian Voss',  severity: 'Moderate' },
    { id: 'OCU-H00003',   patient: 'Elena Rodriguez', age: 37, gender: 'Female', date: '2026-04-29', result: 'Healthy',              confidence: '99.2%', doctor: 'Dr. Julian Voss',  severity: 'Healthy'  }
];

// --- JSON file helpers (fallback only) -------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

function ensureDataStore() {
    if (useSupabase) return;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify(SEED_USERS, null, 2));
    if (!fs.existsSync(RECORDS_FILE)) fs.writeFileSync(RECORDS_FILE, JSON.stringify(SEED_RECORDS, null, 2));
}

function readJsonFile(file, fallback) {
    try {
        ensureDataStore();
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
        return fallback;
    }
}

function writeJsonFile(file, data) {
    ensureDataStore();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Supabase helpers ------------------------------------------------------
// PostgREST returns a "no rows" error code we should treat as "not found".
function unwrap(result) {
    const { data, error } = result;
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
}

// --- MySQL query helpers ---------------------------------------------------
async function mysqlQuery(sql, params = []) {
    const [rows] = await getMysqlPool().execute(sql, params);
    return rows;
}

async function mysqlFindOne(sql, params = []) {
    const rows = await mysqlQuery(sql, params);
    return rows.length ? rows[0] : null;
}

// Build a parameterised "SET a=?, b=?" clause from an object, skipping keys
// whose value is undefined (so a partial patch only touches provided columns).
function buildSetClause(patch) {
    const keys = Object.keys(patch).filter(k => patch[k] !== undefined);
    const clause = keys.map(k => `\`${k}\` = ?`).join(', ');
    const values = keys.map(k => patch[k]);
    return { clause, values, keys };
}

// --- User operations -------------------------------------------------------
async function findUserByToken(token) {
    if (!token) return null;
    if (useSupabase) {
        return unwrap(await supabase.from('users').select('*').eq('token', token).maybeSingle());
    }
    if (useMysql) {
        return mysqlFindOne('SELECT * FROM `users` WHERE `token` = ? LIMIT 1', [token]);
    }
    return readJsonFile(USERS_FILE, SEED_USERS).find(u => u.token === token) || null;
}

async function findUserByUsername(username) {
    if (useSupabase) {
        return unwrap(await supabase.from('users').select('*').eq('username', username).maybeSingle());
    }
    if (useMysql) {
        return mysqlFindOne('SELECT * FROM `users` WHERE `username` = ? LIMIT 1', [username]);
    }
    return readJsonFile(USERS_FILE, SEED_USERS).find(u => u.username === username) || null;
}

async function findUserById(id) {
    if (useSupabase) {
        return unwrap(await supabase.from('users').select('*').eq('id', id).maybeSingle());
    }
    if (useMysql) {
        return mysqlFindOne('SELECT * FROM `users` WHERE `id` = ? LIMIT 1', [id]);
    }
    return readJsonFile(USERS_FILE, SEED_USERS).find(u => u.id === id) || null;
}

async function insertUser(user) {
    if (useSupabase) {
        const { data, error } = await supabase.from('users').insert(user).select().single();
        if (error) throw error;
        return data;
    }
    if (useMysql) {
        const cols = ['id', 'username', 'password', 'name', 'type', 'email', 'avatar', 'created_at', 'token'];
        const values = cols.map(c => user[c] ?? null);
        await mysqlQuery(
            `INSERT INTO \`users\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            values
        );
        return findUserById(user.id);
    }
    const users = readJsonFile(USERS_FILE, SEED_USERS);
    users.push(user);
    writeJsonFile(USERS_FILE, users);
    return user;
}

async function patchUser(id, patch) {
    if (useSupabase) {
        const { data, error } = await supabase.from('users').update(patch).eq('id', id).select().single();
        if (error) throw error;
        return data;
    }
    if (useMysql) {
        const { clause, values } = buildSetClause(patch);
        if (clause) {
            await mysqlQuery(`UPDATE \`users\` SET ${clause} WHERE \`id\` = ?`, [...values, id]);
        }
        return findUserById(id);
    }
    const users = readJsonFile(USERS_FILE, SEED_USERS);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...patch };
    writeJsonFile(USERS_FILE, users);
    return users[idx];
}

async function setUserToken(id, token) {
    return patchUser(id, { token });
}

// --- Record operations -----------------------------------------------------
async function getAllRecords() {
    if (useSupabase) {
        const { data, error } = await supabase
            .from('records')
            .select('*')
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('date', { ascending: false });
        if (error) throw error;
        return data || [];
    }
    if (useMysql) {
        const rows = await mysqlQuery(
            'SELECT * FROM `records` ORDER BY `created_at` DESC, `date` DESC'
        );
        return rows.map(rowToRecord);
    }
    return readJsonFile(RECORDS_FILE, SEED_RECORDS);
}

async function findRecordById(id) {
    if (useSupabase) {
        return unwrap(await supabase.from('records').select('*').eq('id', id).maybeSingle());
    }
    if (useMysql) {
        return rowToRecord(await mysqlFindOne('SELECT * FROM `records` WHERE `id` = ? LIMIT 1', [id]));
    }
    return readJsonFile(RECORDS_FILE, SEED_RECORDS).find(r => r.id === id) || null;
}

async function insertRecord(record) {
    if (useSupabase) {
        const { data, error } = await supabase.from('records').insert(record).select().single();
        if (error) throw error;
        return data;
    }
    if (useMysql) {
        const cols = ['id', 'patient', 'nric', 'age', 'gender', 'date', 'result', 'confidence',
            'doctor', 'severity', 'fundus_image', 'features', 'created_by', 'created_at'];
        const row = recordToRow(record);
        const values = cols.map(c => row[c] ?? null);
        await mysqlQuery(
            `INSERT INTO \`records\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            values
        );
        return findRecordById(record.id);
    }
    const records = readJsonFile(RECORDS_FILE, SEED_RECORDS);
    records.unshift(record);
    writeJsonFile(RECORDS_FILE, records);
    return record;
}

async function patchRecord(id, patch) {
    if (useSupabase) {
        const { data, error } = await supabase.from('records').update(patch).eq('id', id).select().single();
        if (error) throw error;
        return data;
    }
    if (useMysql) {
        const { clause, values } = buildSetClause(recordToRow(patch));
        if (clause) {
            await mysqlQuery(`UPDATE \`records\` SET ${clause} WHERE \`id\` = ?`, [...values, id]);
        }
        return findRecordById(id);
    }
    const records = readJsonFile(RECORDS_FILE, SEED_RECORDS);
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    records[idx] = { ...records[idx], ...patch };
    writeJsonFile(RECORDS_FILE, records);
    return records[idx];
}

async function deleteRecord(id) {
    if (useSupabase) {
        const { data, error } = await supabase.from('records').delete().eq('id', id).select().single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    }
    if (useMysql) {
        const existing = await findRecordById(id);
        if (!existing) return null;
        await mysqlQuery('DELETE FROM `records` WHERE `id` = ?', [id]);
        return existing;
    }
    const records = readJsonFile(RECORDS_FILE, SEED_RECORDS);
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    const [removed] = records.splice(idx, 1);
    writeJsonFile(RECORDS_FILE, records);
    return removed;
}

// --- MySQL schema + seed ---------------------------------------------------
const MYSQL_SCHEMA = [
    `CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\`         VARCHAR(64)  NOT NULL,
        \`username\`   VARCHAR(190) NOT NULL,
        \`password\`   VARCHAR(255) NOT NULL,
        \`name\`       VARCHAR(190) NOT NULL,
        \`type\`       VARCHAR(64)  NOT NULL,
        \`email\`      VARCHAR(255) DEFAULT NULL,
        \`avatar\`     LONGTEXT     DEFAULT NULL,
        \`created_at\` VARCHAR(40)  DEFAULT NULL,
        \`token\`      VARCHAR(128) DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_users_username\` (\`username\`),
        KEY \`idx_users_token\` (\`token\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS \`records\` (
        \`id\`           VARCHAR(32)  NOT NULL,
        \`patient\`      VARCHAR(190) NOT NULL,
        \`nric\`         VARCHAR(32)  DEFAULT NULL,
        \`age\`          INT          DEFAULT 0,
        \`gender\`       VARCHAR(32)  DEFAULT 'Other',
        \`date\`         VARCHAR(40)  DEFAULT NULL,
        \`result\`       VARCHAR(190) DEFAULT NULL,
        \`confidence\`   VARCHAR(32)  DEFAULT NULL,
        \`doctor\`       VARCHAR(190) DEFAULT NULL,
        \`severity\`     VARCHAR(64)  DEFAULT NULL,
        \`fundus_image\` LONGTEXT     DEFAULT NULL,
        \`features\`     JSON         DEFAULT NULL,
        \`created_by\`   VARCHAR(190) DEFAULT NULL,
        \`created_at\`   VARCHAR(40)  DEFAULT NULL,
        \`updated_by\`   VARCHAR(190) DEFAULT NULL,
        \`updated_at\`   VARCHAR(40)  DEFAULT NULL,
        PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

// Add a column only if it isn't already present (portable "ADD COLUMN IF NOT
// EXISTS"). Uses information_schema so it works on MySQL 5.7+ and 8.x.
async function ensureColumn(table, column, definition) {
    const row = await mysqlFindOne(
        `SELECT COUNT(*) AS n FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
    );
    if (row && Number(row.n) === 0) {
        await mysqlQuery(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        console.log(`[db] migrated: added column ${table}.${column}`);
    }
}

async function initMysql() {
    for (const ddl of MYSQL_SCHEMA) {
        await mysqlQuery(ddl);
    }

    // Lightweight, idempotent column migrations for tables created before a
    // field existed. MySQL has no portable "ADD COLUMN IF NOT EXISTS", so we
    // check information_schema first.
    await ensureColumn('records', 'nric', "VARCHAR(32) DEFAULT NULL AFTER `patient`");

    // Seed only when empty so restarts never clobber real data.
    const userCount = await mysqlFindOne('SELECT COUNT(*) AS n FROM `users`');
    if (userCount && Number(userCount.n) === 0) {
        for (const u of SEED_USERS) await insertUser(u);
        console.log(`[db] seeded ${SEED_USERS.length} users`);
    }
    const recCount = await mysqlFindOne('SELECT COUNT(*) AS n FROM `records`');
    if (recCount && Number(recCount.n) === 0) {
        for (const r of SEED_RECORDS) await insertRecord(r);
        console.log(`[db] seeded ${SEED_RECORDS.length} records`);
    }
}

// --- Bootstrap -------------------------------------------------------------
async function init() {
    if (useSupabase) {
        // Sanity check the connection. Throwing here surfaces auth / typo issues
        // at process start instead of on the first request.
        const { error } = await supabase.from('users').select('id').limit(1);
        if (error) {
            console.error('[db] Supabase connection failed:', error.message);
            throw error;
        }
        console.log('[db] storage backend: Supabase');
    } else if (useMysql) {
        try {
            await initMysql();
        } catch (err) {
            console.error('[db] MySQL initialisation failed:', err.message);
            throw err;
        }
        console.log(`[db] storage backend: MySQL (${process.env.MYSQL_DATABASE} @ ${process.env.MYSQL_HOST || '127.0.0.1'}:${process.env.MYSQL_PORT || '3306'})`);
    } else {
        ensureDataStore();
        console.log('[db] storage backend: local JSON files (./data) — set SUPABASE_URL + SUPABASE_SERVICE_KEY to switch to Supabase');
    }
}

module.exports = {
    useSupabase,
    useMysql,
    init,
    // users
    findUserByToken,
    findUserByUsername,
    findUserById,
    insertUser,
    patchUser,
    setUserToken,
    // records
    getAllRecords,
    findRecordById,
    insertRecord,
    patchRecord,
    deleteRecord
};
