import { describe, expect, it } from 'vitest'
import { isSoftwareRenderer } from '../../app/utils/webgl-context'

describe('isSoftwareRenderer', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ])('names %s a CPU renderer', (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(true)
  })

  it.each([
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    // Mesa's hardware driver names its LLVM shader compiler too.
    'ANGLE (AMD, AMD Radeon RX 9070 XT (radeonsi gfx1201 LLVM 20.1.2), OpenGL 4.6)',
    'Apple GPU',
    'Adreno (TM) 640',
    'Mali-G78',
    'WebKit WebGL',
  ])('names %s a GPU renderer', (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(false)
  })
})
