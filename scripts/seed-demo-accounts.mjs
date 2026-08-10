#!/usr/bin/env node
// Creates the 4 demo login accounts (Super Admin, HR, Manager, Employee) required by
// section 13 of the master prompt, and links each to the matching seeded employee row.
//
// Run AFTER applying migrations + supabase/seed/*.sql, with the service role key set:
//   node --env-file=apps/admin-web/.env.local scripts/seed-demo-accounts.mjs
//
// DEV/DEMO ONLY. Never run this against a production project, and never reuse this
// password in production — profiles.must_change_password is set to true so every
// demo account is forced to change it on first login anyway.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_PASSWORD = "NineallDemo2026!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_ACCOUNTS = [
  { email: "admin@nineallgroup.co.th", role: "super_admin", employeeCode: "EMP-001", fullName: "สมชาย ใจดี" },
  { email: "hr@nineallgroup.co.th", role: "hr", employeeCode: "EMP-002", fullName: "กัญญาวีร์ สมใจ" },
  { email: "manager@nineallgroup.co.th", role: "manager", employeeCode: "EMP-003", fullName: "ธนภูมิ ใจดี" },
  { email: "employee@nineallgroup.co.th", role: "employee", employeeCode: "EMP-004", fullName: "วิภาวรรณ แสงทิพย์" },
];

async function main() {
  for (const account of DEMO_ACCOUNTS) {
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id")
      .eq("org_id", ORG_ID)
      .eq("employee_code", account.employeeCode)
      .single();

    if (employeeError || !employee) {
      console.error(`✖ ${account.employeeCode}: employee not found — run the SQL seed scripts first.`);
      continue;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("id").eq("employee_id", employee.id).maybeSingle();
    if (existingProfile) {
      console.log(`↷ ${account.email}: profile already exists, skipping.`);
      continue;
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: account.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    if (createError || !created.user) {
      console.error(`✖ ${account.email}: ${createError?.message ?? "failed to create auth user"}`);
      continue;
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: created.user.id,
      org_id: ORG_ID,
      employee_id: employee.id,
      role: account.role,
      full_name: account.fullName,
      email: account.email,
      must_change_password: true,
    });

    if (profileError) {
      console.error(`✖ ${account.email}: profile insert failed — ${profileError.message}`);
      continue;
    }

    console.log(`✔ ${account.email} (${account.role}) created. Temp password: ${DEMO_PASSWORD}`);
  }
}

main();
