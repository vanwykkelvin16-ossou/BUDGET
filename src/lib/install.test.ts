import { describe, expect, it } from 'vitest'
import { detectPlatform, INSTALL_STEPS, installState, type InstallEnv } from './install'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

function env(over: Partial<InstallEnv> = {}): InstallEnv {
  return { userAgent: ANDROID, standalone: false, canPrompt: false, ...over }
}

describe('detectPlatform', () => {
  it('reads iPhone and Android user agents', () => {
    expect(detectPlatform(IPHONE)).toBe('ios')
    expect(detectPlatform(ANDROID)).toBe('android')
  })

  it('treats a touchscreen "Mac" as iPadOS', () => {
    expect(detectPlatform(IPAD_DESKTOP_UA, 5)).toBe('ios')
    expect(detectPlatform(IPAD_DESKTOP_UA, 0)).toBe('other')
  })

  it('prefers Android when Chrome claims to be Linux and Safari-ish', () => {
    expect(detectPlatform(ANDROID, 5)).toBe('android')
  })

  it('falls back to other on a desktop browser', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0')).toBe(
      'other',
    )
  })
})

describe('installState', () => {
  it('offers nothing once it runs standalone', () => {
    expect(installState(env({ standalone: true, canPrompt: true }))).toEqual({
      kind: 'installed',
      platform: 'android',
    })
  })

  it('offers the native prompt when one is parked', () => {
    expect(installState(env({ canPrompt: true }))).toEqual({
      kind: 'prompt',
      platform: 'android',
    })
  })

  it('falls back to manual steps on iOS, which never fires the event', () => {
    expect(installState(env({ userAgent: IPHONE }))).toEqual({ kind: 'steps', platform: 'ios' })
  })
})

describe('INSTALL_STEPS', () => {
  it('has instructions for every platform', () => {
    for (const platform of ['ios', 'android', 'other'] as const) {
      expect(INSTALL_STEPS[platform].length).toBeGreaterThan(0)
    }
  })

  it('points iOS users at the Share sheet', () => {
    expect(INSTALL_STEPS.ios.join(' ')).toMatch(/Share/)
  })
})
