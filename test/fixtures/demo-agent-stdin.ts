import process from 'node:process'

process.stdin.resume()
process.stdin.on('end', () => process.stdout.write('input closed'))
