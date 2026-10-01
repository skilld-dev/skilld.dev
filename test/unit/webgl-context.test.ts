import { describe, expect, it, vi } from 'vitest'
import { isSoftwareRenderer, isUsableWebGL2Context } from '../../app/utils/webgl-context'

const requiredMethodNames = [
  'attachShader',
  'bindVertexArray',
  'blendFunc',
  'clear',
  'clearColor',
  'compileShader',
  'createProgram',
  'createShader',
  'createVertexArray',
  'deleteProgram',
  'deleteShader',
  'deleteVertexArray',
  'drawArrays',
  'enable',
  'getExtension',
  'getProgramInfoLog',
  'getProgramParameter',
  'getShaderInfoLog',
  'getShaderParameter',
  'getUniformLocation',
  'linkProgram',
  'shaderSource',
  'uniform1f',
  'uniform2f',
  'useProgram',
  'viewport',
] as const

function contextStub(): Record<string, unknown> {
  return {
    ...Object.fromEntries(requiredMethodNames.map(name => [name, vi.fn()])),
    BLEND: 1,
    COLOR_BUFFER_BIT: 2,
    COMPILE_STATUS: 3,
    FRAGMENT_SHADER: 4,
    LINK_STATUS: 5,
    ONE_MINUS_SRC_ALPHA: 6,
    SRC_ALPHA: 7,
    TRIANGLES: 8,
    VERTEX_SHADER: 9,
  }
}

describe('isUsableWebGL2Context', () => {
  it('rejects a partial context missing getShaderParameter', () => {
    const context = contextStub()
    delete context.getShaderParameter

    expect(isUsableWebGL2Context(context)).toBe(false)
  })

  it('accepts a context that exposes every operation used by NoiseField', () => {
    expect(isUsableWebGL2Context(contextStub())).toBe(true)
  })
})

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
