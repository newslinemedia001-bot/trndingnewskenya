#!/usr/bin/env node
/**
 * Create an editorial account from the command line — mainly the first
 * administrator, since the desk itself needs one to start.
 *
 *   node scripts/create-staff.mjs \
 *     --name "Amina Wanjiku" \
 *     --email amina@trendingnewskenya.co.ke \
 *     --password "a-long-password" \
 *     --role admin \
 *     --title "Managing editor"
 *
 * Writes straight to Firestore, so it needs the same service-account key the
 * desk uses: FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS).
 *
 * The hash format below must stay in step with lib/desk/accounts.js:
 *   scrypt$N$r$p$<salt base64url>$<hash base64url>
 */
import { readFile } from 'node:fs/promises'
import { randomUUID, randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import path from 'node:path'

const scrypt = promisify(scryptCallback)
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 }
const ROLES = ['admin', 'editor']

async function loadEnv() {
  try {
    const raw = await readFile(path.join(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      if (!process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local is optional.
  }
}

await loadEnv()

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : fallback
}

const name = arg('name')
const email = String(arg('email')).trim().toLowerCase()
const password = arg('password')
const role = arg('role', 'admin')
const title = arg('title', 'Editor')

if (!name || !email || !password) {
  console.error(
    'Usage: node scripts/create-staff.mjs --name "Full Name" --email person@example.com --password "secret" [--role admin|editor] [--title "Job title"]'
  )
  process.exit(1)
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('That email address does not look valid.')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Use a password of at least 8 characters.')
  process.exit(1)
}
if (!ROLES.includes(role)) {
  console.error(`Role must be one of: ${ROLES.join(', ')}`)
  process.exit(1)
}

async function hashPassword(value) {
  const salt = randomBytes(16)
  const derived = await scrypt(value, salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 128 * 1024 * 1024,
  })
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

function bylineSlug(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const now = new Date().toISOString()
const record = {
  id: randomUUID(),
  email,
  name: name.trim(),
  slug: bylineSlug(name) || `staff-${Date.now()}`,
  title: title.trim(),
  role,
  active: true,
  passwordHash: await hashPassword(password),
  createdAt: now,
  updatedAt: now,
  createdBy: 'scripts/create-staff.mjs',
  lastLoginAt: null,
}

const byline = {
  name: record.name,
  role: record.title,
  bio: '',
  updatedAt: now,
}

const { hasAdminCredentials, readCollection, writeDoc } = await import(
  '../lib/desk/firestore-rest.mjs'
)

if (!hasAdminCredentials()) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT to a service-account key file before creating staff.')
  process.exit(1)
}

const existing = await readCollection('users', { field: 'email', op: '==', value: email })
if (existing.length) {
  console.error(`An account already exists for ${email}.`)
  process.exit(1)
}

await writeDoc('users', record.id, record, { merge: false })
await writeDoc('authors', record.slug, byline, { merge: false })
console.log(`✓ ${record.name} <${email}> created in Firestore as ${role}.`)
