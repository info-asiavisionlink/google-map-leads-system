/** 都道府県ごとの最大検索半径（km） */
const PREFECTURE_MAX_RADIUS_KM: Record<string, number> = {
  東京都: 80,
  大阪府: 60,
  福岡県: 100,
  北海道: 250,
};

const DEFAULT_MAX_RADIUS_KM = 120;

export function getMaxSearchRadiusKm(prefecture: string): number {
  return PREFECTURE_MAX_RADIUS_KM[prefecture] ?? DEFAULT_MAX_RADIUS_KM;
}
