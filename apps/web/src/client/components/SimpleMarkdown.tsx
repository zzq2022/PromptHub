import React from 'react';

interface SimpleMarkdownProps {
  content: string;
}

export function SimpleMarkdown({ content }: SimpleMarkdownProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let currentList: React.ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${listKey++}`} className="list-disc pl-6 mb-4 space-y-1 text-slate-700 dark:text-slate-300">
          {currentList}
        </ul>
      );
      currentList = [];
    }
  };

  const renderInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
    const segments = text.split(regex);

    segments.forEach((seg, i) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        parts.push(<strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{seg.slice(2, -2)}</strong>);
      } else if (seg.startsWith('`') && seg.endsWith('`')) {
        parts.push(
          <code key={i} className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono text-pink-600 dark:text-pink-400 border border-slate-200/50 dark:border-slate-700/50">
            {seg.slice(1, -1)}
          </code>
        );
      } else if (seg.startsWith('[') && seg.includes('](')) {
        const mid = seg.indexOf('](');
        const linkText = seg.slice(1, mid);
        const linkHref = seg.slice(mid + 2, -1);
        parts.push(
          <a
            key={i}
            href={linkHref}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
          >
            {linkText}
          </a>
        );
      } else {
        parts.push(seg);
      }
    });

    return parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        elements.push(
          <pre
            key={`code-${i}`}
            className="bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto font-mono text-xs sm:text-sm mb-5 border border-slate-800 shadow-inner"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Handle headers
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={i} className="text-2xl font-bold mt-7 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2 text-slate-900 dark:text-slate-50">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={i} className="text-xl font-bold mt-6 mb-3 text-slate-900 dark:text-slate-100">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={i} className="text-lg font-semibold mt-5 mb-2 text-slate-900 dark:text-slate-100">
          {renderInline(line.slice(4))}
        </h3>
      );
    }
    // Handle bullet lists
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      currentList.push(
        <li key={i} className="leading-relaxed">
          {renderInline(line.slice(2))}
        </li>
      );
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={i} className="mb-4 text-slate-700 dark:text-slate-300 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  flushList();

  return <div className="markdown-body select-text">{elements}</div>;
}
