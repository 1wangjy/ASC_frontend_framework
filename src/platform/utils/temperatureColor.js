/**
 * Temperature → RGB color mapping.
 * Maps a normalised temperature value (0–1) through a 5-stop
 * blue → cyan → green → yellow → red gradient.
 */
export function getTemperatureColor(temp, minTemp, maxTemp) {
  const t = (temp - minTemp) / (maxTemp - minTemp)
  const clampedT = Math.max(0, Math.min(1, t))
  let r, g, b
  if (clampedT < 0.2) {
    r = 0; g = 0; b = clampedT / 0.2
  } else if (clampedT < 0.4) {
    r = 0; g = (clampedT - 0.2) / 0.2; b = 1
  } else if (clampedT < 0.6) {
    r = 0; g = 1; b = 1 - (clampedT - 0.4) / 0.2
  } else if (clampedT < 0.8) {
    r = (clampedT - 0.6) / 0.2; g = 1; b = 0
  } else {
    r = 1; g = 1 - (clampedT - 0.8) / 0.2; b = 0
  }
  return { r, g, b }
}