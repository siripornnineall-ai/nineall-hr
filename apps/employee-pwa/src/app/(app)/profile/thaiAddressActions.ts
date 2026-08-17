"use server";

import { listProvinces, listAmphoes, listTambons } from "@/lib/thaiAddress";

export async function getThaiProvincesAction(): Promise<string[]> {
  return listProvinces();
}

export async function getThaiAmphoesAction(province: string): Promise<string[]> {
  return listAmphoes(province);
}

export async function getThaiTambonsAction(province: string, amphoe: string): Promise<{ tambon: string; zipcode: string }[]> {
  return listTambons(province, amphoe);
}
