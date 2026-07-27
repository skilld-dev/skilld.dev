import { describe, expect, it, vi } from 'vitest'
import { isUsableWebGL2Context } from '../../app/utils/webgl-context'

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
