// Timeline Markdown copy/export.

async function copyTimelineMarkdown(scope = 'shown') {
  const view = getTimelineVisibleItems();
  const timeline = scope === 'matching' ? view.matchingItems : view.visibleItems;
  const scopeLabel = scope === 'matching' ? 'All matching' : 'Shown';

  if (!timeline.length) {
    showToast('There is nothing to copy for the current timeline view.');
    return;
  }

  const markdown = buildTimelineMarkdown(timeline, scopeLabel);
  const copied = await writeTextToClipboard(markdown);
  const count = timeline.length;
  const chars = markdown.length;

  if (copied) {
    showToast(`Copied ${formatNumber(count)} timeline ${count === 1 ? 'item' : 'items'} (${formatNumber(chars)} characters).`);
  } else {
    showToast(`Could not copy ${formatNumber(count)} timeline ${count === 1 ? 'item' : 'items'} (${formatNumber(chars)} characters).`);
  }
}

function copyTimelineAllMatchingMarkdown() {
  return copyTimelineMarkdown('matching');
}

function buildTimelineMarkdown(timeline, scopeLabel = 'Shown') {
  const hasLoadSummaries = timelineHasLoadSummaries(timeline);
  const lines = [
    '# Physio Timeline Notes',
    '',
    `Generated: ${formatExportTimestamp(new Date())}`,
    `Scope: ${timelineScopeSummary(scopeLabel)}`,
    `Items: ${formatNumber(timeline.length)}`,
    `Date range: ${timelineDateRange(timeline)}`,
    '',
  ];

  if (hasLoadSummaries) {
    lines.push('Load terms: Computer active time is all active computer use. Physical work estimate is timed work total minus computer work. Total tendon load is computer active time plus physical work estimate.');
    lines.push('');
  }

  groupedTimelineEvents(timeline).forEach((group, groupIndex) => {
    if (groupIndex > 0) lines.push('');
    lines.push(`## ${formatEventDate(group.date)}`);
    lines.push('');
    const loadSummary = timelineLoadSummaryMarkdown(group.date);
    if (loadSummary) {
      lines.push(`_${loadSummary}_`);
      lines.push('');
    }
    let lastSegment = null;
    group.events.forEach(ev => {
      const segment = timelineDaySegment(ev.time);
      if (segment === 'late' && lastSegment !== 'late') {
        lines.push(`_Before ${formatBoundaryTime(getPersonalDayStartTime())} - ${formatShortDate(getWakingDayForEvent(ev.date, ev.time, getPersonalDayStartTime()))} waking day_`);
      }
      lines.push(formatTimelineEventMarkdown(ev));
      lastSegment = segment;
    });
  });

  return lines.join('\n');
}

function timelineHasLoadSummaries(timeline) {
  return groupedTimelineEvents(timeline).some(group => Boolean(timelineLoadSummaryMarkdown(group.date)));
}

function timelineLoadSummaryMarkdown(dateStr) {
  return typeof getActivityWatchTimelineMarkdownSummary === 'function'
    ? getActivityWatchTimelineMarkdownSummary(dateStr)
    : '';
}

function formatTimelineEventMarkdown(ev) {
  const time = formatEventTime(ev.time) || 'No time';
  return `- **${time}** - ${formatTimelineEventMarkdownBody(ev)}`;
}

function formatTimelineEventMarkdownBody(ev) {
  if (ev.type === 'note') return formatMarkdownEntryText(ev.text || '');
  if (ev.type === 'exercise-log') {
    const parts = [`**${eventTitle(ev)}**`];
    const detail = eventText(ev);
    if (detail) parts.push(detail);
    return parts.join(': ');
  }

  const status = exerciseStatusLabel(ev);
  const parts = [`**${status ? `${status}: ` : ''}${eventTitle(ev)}**`];
  const detail = eventText(ev);
  if (detail) parts.push(detail);
  if (ev.annotation) parts.push(formatMarkdownEntryText(ev.annotation));
  return parts.join(': ');
}

function formatMarkdownEntryText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\n/g, '\n  ');
}

function timelineDateRange(timeline) {
  const dates = timeline
    .map(ev => ev.date)
    .filter(date => date && date !== 'undated')
    .sort();

  if (!dates.length) return 'No dated items';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return formatEventDate(first);
  return `${formatEventDate(first)} - ${formatEventDate(last)}`;
}

function formatExportTimestamp(date) {
  return `${formatEventDate(toDateStr(date))} ${formatEventTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)}`;
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // File URLs and non-secure contexts often reject the async Clipboard API.
    }
  }

  return fallbackCopyText(text);
}

function fallbackCopyText(text) {
  if (copyTextWithEvent(text)) return true;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (err) {
    copied = false;
  }

  document.body.removeChild(textarea);

  if (selection && selectedRange) {
    selection.removeAllRanges();
    selection.addRange(selectedRange);
  }

  return copied;
}

function copyTextWithEvent(text) {
  let copied = false;
  const handleCopy = (event) => {
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    copied = true;
  };

  document.addEventListener('copy', handleCopy);
  try {
    copied = document.execCommand('copy') && copied;
  } catch (err) {
    copied = false;
  }
  document.removeEventListener('copy', handleCopy);

  return copied;
}

function formatNumber(value) {
  return Number(value).toLocaleString();
}
