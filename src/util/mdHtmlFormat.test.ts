import { strict as assert } from 'assert';
import { extractMarkdown, embedMarkdown } from './mdHtmlFormat';

const simpleHtml = `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
  <h1>Test</h1>
</body>
</html>`;

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
  <h1>Test</h1>
  <script type="text/markdown" id="md-source">
# Hello World
  </script>
</body>
</html>`;

// Test extract from empty
assert.equal(extractMarkdown(''), null);

// Test extract from plain
assert.equal(extractMarkdown(simpleHtml), null);

// Test extract from full
assert.equal(extractMarkdown(fullHtml), '# Hello World');

// Test embed to plain
const embeddedPlain = embedMarkdown(simpleHtml, '# New Content');
assert.ok(embeddedPlain.includes('<script type="text/markdown" id="md-source">'));
assert.ok(embeddedPlain.includes('# New Content'));

// Test embed to full (replace)
const embeddedFull = embedMarkdown(fullHtml, '# Replaced Content');
assert.ok(embeddedFull.includes('# Replaced Content'));
assert.ok(!embeddedFull.includes('# Hello World'));
assert.equal(embeddedFull.match(/<script type="text\/markdown" id="md-source">/g)?.length, 1);

// Test script tag escaping
const scriptHtml = embedMarkdown(simpleHtml, '<script>alert("test")</script>');
assert.ok(scriptHtml.includes('<\\/script>'));
assert.equal(extractMarkdown(scriptHtml), '<script>alert("test")</script>');

console.log('All tests passed!');
