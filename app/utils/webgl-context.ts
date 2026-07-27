const requiredWebGL2Methods = [
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

const requiredWebGL2Constants = [
  'BLEND',
  'COLOR_BUFFER_BIT',
  'COMPILE_STATUS',
  'FRAGMENT_SHADER',
  'LINK_STATUS',
  'ONE_MINUS_SRC_ALPHA',
  'SRC_ALPHA',
  'TRIANGLES',
  'VERTEX_SHADER',
] as const

export function isUsableWebGL2Context(value: unknown): value is WebGL2RenderingContext {
  if (typeof value !== 'object' || value === null)
    return false

  const candidate = value as Record<string, unknown>
  return requiredWebGL2Methods.every(name => typeof candidate[name] === 'function')
    && requiredWebGL2Constants.every(name => typeof candidate[name] === 'number')
}
