/**
 * API type definitions for the data platform module.
 * Documented with JSDoc for consistency with the parent project.
 */

/** @typedef {{ code: number, data: T, message?: string }} ApiResult */
/** @typedef {{ success: boolean, data?: T, error?: string, message?: string }} ApiSuccessResult */
/** @typedef {{ username: string, password: string }} LoginRequest */
/** @typedef {{ username: string, role?: string }} LoginUser */
/** @typedef {LoginUser} LoginResponse */

export default {}