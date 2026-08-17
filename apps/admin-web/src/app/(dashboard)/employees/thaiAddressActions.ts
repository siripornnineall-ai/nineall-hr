"use server";

import { requireUser } from "@/lib/auth";
import { listProvinces, listAmphoes, listTambons } from "@/lib/thaiAddress";

export async function getThaiProvincesAction(): Promise<string[]> {
  await requireUser();
  return listProvinces();
}

export async function getThaiAmphoesAction(province: string): Promise<string[]> {
  await requireUser();
  return listAmphoes(province);
}

export async function getThaiTambonsAction(province: string, amphoe: string): Promise<{ tambon: string; zipcode: string }[]> {
  await requireUser();
  return listTambons(province, amphoe);
}
