const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const spacing = /^\d{1,2}px(?: \d{1,2}px){0,3}$/;

const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'mark', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr'
  ]),
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    span: ['style'],
    mark: ['style'],
    div: ['style'],
    th: ['style'],
    td: ['style']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedStyles: {
    '*': {
      color: [hexColor],
      'background-color': [hexColor],
      'font-weight': [/^(400|500|600|700|800|bold)$/],
      display: [/^inline-block$/],
      padding: [spacing],
      margin: [/^0 0 \d{1,2}px$/],
      'border-radius': [/^\d{1,2}px$/],
      'border-left': [/^\d{1,2}px solid #(?:[0-9a-f]{3}|[0-9a-f]{6})$/i],
      'line-height': [/^\d(?:\.\d)?$/]
    }
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer'
    }, true)
  }
};

function renderCourseDescription(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return '';

  return sanitizeHtml(md.render(source), sanitizeOptions);
}

module.exports = {
  renderCourseDescription
};
