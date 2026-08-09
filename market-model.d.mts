/**
 * ประกาศชนิดของ market-model.mjs — มีไว้ให้ฝั่ง TypeScript (Sanity Studio) import
 * ไฟล์ .mjs ตัวจริงได้โดยไม่ต้องก๊อปสูตรไปวางซ้ำ
 *
 * ชื่อไฟล์ต้องเป็น .d.mts และวางคู่กับ market-model.mjs — TypeScript resolve
 * './market-model.mjs' มาที่นี่เอง อย่าเปลี่ยนชื่อหรือย้ายแยกกัน
 */
export interface MarketRow {
  building?: string
  intent?: string
  psqm: number
  floor?: number | null
}

export interface FloorPremium {
  value: number
  n: number
  k: number
  loFloor: number
  loPsqm: number
  hiFloor: number
  hiPsqm: number
}

export interface BuildingModel {
  nSale: number
  nRent: number
  saleRef: number | null
  rentRef: number | null
  refFloorSale: number | null
  refFloorRent: number | null
  fpRaw: FloorPremium | null
  yieldOwn: number | null
  /** true = ข้อมูลตัวเองใช้ไม่ได้ (น้อยเกิน/ติดลบ) เลยยืมค่ากลางของทุกตึกมาใช้ */
  usedGlobalFp: boolean
  usedGlobalYield: boolean
  fpSale: number
  yieldUsed: number
  fpRentOwn: number
  fpRentAvg: number
  rentRefAvg: number | null
}

export interface Market {
  fpSale: number
  avgYield: number
  byBuilding: Record<string, BuildingModel>
}

export const MIN_N: number
export const BANDS: number
export function mean(a: number[]): number
export function median(a: number[]): number
export function iqrKeep<T>(rows: T[], pick?: (r: T) => number): T[]
export function floorPremiumOf(rows: MarketRow[]): FloorPremium | null
export function marketModel(rows: MarketRow[]): Market
export function expectedPsqm(
  ref: number | null | undefined,
  premium: number,
  refFloor: number | null | undefined,
  floor: number | null | undefined,
): number | null
export function valueVsExpected(actual: number, expected: number | null): number | null
