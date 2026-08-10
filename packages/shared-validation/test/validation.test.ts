import { describe, expect, it } from "vitest";
import { clockInPayloadSchema, employeeCreateSchema, leaveRequestSchema, loginSchema, overtimeRequestSchema } from "../src/index";

describe("loginSchema", () => {
  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ identifier: "admin@nineallgroup.co.th", password: "" });
    expect(result.success).toBe(false);
  });

  it("accepts an employee code as the identifier", () => {
    const result = loginSchema.safeParse({ identifier: "EMP-001", password: "hunter2" });
    expect(result.success).toBe(true);
  });
});

describe("employeeCreateSchema", () => {
  it("requires a positive base salary", () => {
    const result = employeeCreateSchema.safeParse({
      employeeCode: "EMP-100",
      firstName: "สมชาย",
      lastName: "ใจดี",
      employmentType: "monthly",
      hireDate: "2026-08-01",
      baseAmountBaht: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid minimal employee", () => {
    const result = employeeCreateSchema.safeParse({
      employeeCode: "EMP-100",
      firstName: "สมชาย",
      lastName: "ใจดี",
      employmentType: "monthly",
      hireDate: "2026-08-01",
      baseAmountBaht: 25000,
    });
    expect(result.success).toBe(true);
  });
});

describe("leaveRequestSchema", () => {
  it("rejects an end date before the start date", () => {
    const result = leaveRequestSchema.safeParse({
      leaveTypeId: "123e4567-e89b-12d3-a456-426614174000",
      startDate: "2026-08-10",
      endDate: "2026-08-05",
      unit: "full_day",
      reason: "ลาพักร้อน",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid same-day leave request", () => {
    const result = leaveRequestSchema.safeParse({
      leaveTypeId: "123e4567-e89b-12d3-a456-426614174000",
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      unit: "full_day",
      reason: "ลาป่วย",
    });
    expect(result.success).toBe(true);
  });
});

describe("overtimeRequestSchema", () => {
  it("caps requested hours at 24", () => {
    const result = overtimeRequestSchema.safeParse({
      workDate: "2026-08-10",
      startTime: "18:00",
      endTime: "23:00",
      requestedHours: 30,
      reason: "ปิดยอดสิ้นเดือน",
    });
    expect(result.success).toBe(false);
  });
});

describe("clockInPayloadSchema", () => {
  it("requires a selfie path", () => {
    const result = clockInPayloadSchema.safeParse({
      deviceAt: new Date().toISOString(),
      latitude: 13.75,
      longitude: 100.5,
      accuracyM: 10,
      selfiePath: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid clock-in payload and defaults isOfflineSubmission to false", () => {
    const result = clockInPayloadSchema.parse({
      deviceAt: new Date().toISOString(),
      latitude: 13.75,
      longitude: 100.5,
      accuracyM: 10,
      selfiePath: "org/employee/selfie.jpg",
    });
    expect(result.isOfflineSubmission).toBe(false);
  });
});
