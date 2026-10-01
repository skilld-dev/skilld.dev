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

/**
 * Renderers that run WebGL on the CPU: Chrome's SwiftShader fallback, Mesa's
 * llvmpipe and softpipe, and Windows without a GPU driver. On these, every
 * frame of a full-bleed shader is main-thread work.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render driver/i

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE_RENDERER.test(renderer)
}

/**
 * The GPU name when the browser exposes it. Firefox and Safari may mask it;
 * a masked name reads as a GPU, and `failIfMajorPerformanceCaveat` covers them.
 */
export function webglRendererName(gl: WebGL2RenderingContext): string {
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const name: unknown = gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
  return typeof name === 'string' ? name : ''
}
