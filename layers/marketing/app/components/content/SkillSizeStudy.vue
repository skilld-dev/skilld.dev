<script setup lang="ts">
import summary from '../../../../../public/research/skill-md-size-2026-10-09/summary.json'
import vocabulary from '../../../../../public/research/skill-md-size-2026-10-09/words.json'

const { chart } = defineProps<{ chart: 'body' | 'topics' | 'descriptions' | 'words' }>()
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 })
const decimal = (value: number | null, digits = 1) => value === null ? 'Unavailable' : value.toFixed(digits)
const topicLabels: Record<string, string> = {
  coding: 'Coding',
  writing: 'Writing',
  design: 'Design',
  operations: 'Operations',
  data: 'Data',
  planning: 'Planning',
  security: 'Security',
  research: 'Research',
  other: 'Other tasks',
  unclear: 'Task category uncertain',
}
const totals = summary.topics.reduce((total, topic) => ({
  green: total.green + topic.bands.green,
  amber: total.amber + topic.bands.amber,
  red: total.red + topic.bands.red,
}), { green: 0, amber: 0, red: 0 })
const bodyBands = [
  { label: 'At most 2,500 tokens', count: totals.green, class: 'study-green' },
  { label: '2,501 to 4,999 tokens', count: totals.amber, class: 'study-amber' },
  { label: '5,000 tokens or more', count: totals.red, class: 'study-red' },
]
const bandLabel = (min: number, max: number | null) => max === null ? `${number(min)}+` : `${number(min)} to ${number(max)}`
</script>

<template>
  <figure class="study-chart not-prose">
    <template v-if="chart === 'body'">
      <h3>Most Skill bodies fit below 5,000 tokens</h3>
      <p class="study-note">
        12,138 measured bodies. Three source versions unavailable.
      </p>
      <div v-for="band in bodyBands" :key="band.label" class="study-band">
        <div class="study-row-label">
          <span>{{ band.label }}</span>
          <span class="study-number">{{ number(band.count) }} · {{ decimal(band.count / summary.included.bodyMeasured * 100) }}%</span>
        </div>
        <div class="study-track" aria-hidden="true">
          <span :class="band.class" :style="{ width: `${band.count / summary.included.bodyMeasured * 100}%` }" />
        </div>
      </div>
      <div class="study-axis">
        <span>0%</span><span>100% of measured bodies</span>
      </div>
      <dl class="study-stats">
        <div><dt>Median body</dt><dd>{{ number(summary.included.bodyMedian!) }} tokens</dd></div>
        <div><dt>Mean body</dt><dd>{{ number(summary.included.bodyMean!) }} tokens</dd></div>
        <div><dt>90th percentile</dt><dd>{{ number(summary.included.bodyP90!) }} tokens</dd></div>
      </dl>
      <figcaption>Estimated with o200k_base. Colours show context use, not quality. Green marks half the recommended budget.</figcaption>
    </template>

    <template v-else-if="chart === 'topics'">
      <h3>Avg Skill.md Size</h3>
      <p class="study-note">
        Whole-file size, including frontmatter. Task categories come from description assessment.
      </p>
      <div class="study-table" role="region" aria-label="Skill size by task category" tabindex="0">
        <table>
          <caption class="sr-only">
            Means by task category, with measured Skill counts and reference coverage
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Task category
              </th><th scope="col">
                Skills
              </th><th scope="col">
                Description chars
              </th><th scope="col">
                SKILL.md kB
              </th><th scope="col">
                Reference files
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="topic in summary.topics" :key="topic.topic">
              <th scope="row">
                {{ topicLabels[topic.topic] }}
              </th>
              <td>{{ number(topic.skills) }}</td>
              <td>{{ number(topic.descriptionMean!) }}</td>
              <td>
                <span>{{ decimal(topic.fileMeanKB) }}</span>
                <span class="study-mini-track" aria-hidden="true"><span :style="{ width: `${topic.fileMeanKB! / 16 * 100}%` }" /></span>
              </td>
              <td>{{ decimal(topic.referenceMean, 2) }}<small>{{ number(topic.referenceMeasured) }} inventories</small></td>
            </tr>
          </tbody>
        </table>
      </div>
      <figcaption>1 kB = 1,000 UTF-8 bytes. Bars start at zero, scale ends at 16 kB. Missing reference inventories stay missing. Zero counts remain in the mean.</figcaption>
    </template>

    <template v-else-if="chart === 'descriptions'">
      <h3>Shorter descriptions do not always give clearer selection guidance</h3>
      <p class="study-note">
        Jev 1.13 assessment of task, activation, scope, and filler. Observed association, without an Agent selection test.
      </p>
      <div class="study-legend">
        <span><i class="study-clear" />Clear guidance</span><span><i class="study-uncertain" />Uncertain</span><span><i class="study-red" />Needs work</span>
      </div>
      <div v-for="band in summary.descriptionBands" :key="band.min" class="study-band">
        <div class="study-row-label">
          <span>{{ bandLabel(band.min, band.max) }} characters</span><span class="study-number">{{ number(band.total) }} Skills</span>
        </div>
        <div class="study-track study-stack" aria-hidden="true">
          <span class="study-clear" :style="{ width: `${band.clear / band.total * 100}%` }" />
          <span class="study-uncertain" :style="{ width: `${band.uncertain / band.total * 100}%` }" />
          <span class="study-red" :style="{ width: `${band.needsWork / band.total * 100}%` }" />
        </div>
        <p class="study-note">
          {{ decimal(band.clear / band.total * 100) }}% clear · {{ number(band.uncertain) }} uncertain · {{ number(band.needsWork) }} need work
        </p>
      </div>
      <figcaption>12,141 descriptions. Labels describe model judgements under a published rubric, not proven performance.</figcaption>
    </template>

    <template v-else>
      <h3>The words Skill authors use</h3>
      <div class="study-cloud" aria-hidden="true">
        <span v-for="word in vocabulary.words.slice(0, 32)" :key="word.text" :style="{ fontSize: `${0.8 + word.count / vocabulary.words[0]!.count * 2.1}rem` }">{{ word.text }}</span>
      </div>
      <details>
        <summary>Word frequencies and counting method</summary>
        <p class="study-note">
          {{ vocabulary.method }} Font size is a visual aid. Counts below give the precise frequency.
        </p>
        <div class="study-table">
          <table>
            <caption class="sr-only">
              Top 32 words counted once per description
            </caption><thead>
              <tr>
                <th scope="col">
                  Word
                </th><th scope="col">
                  Descriptions containing it
                </th>
              </tr>
            </thead><tbody>
              <tr v-for="word in vocabulary.words.slice(0, 32)" :key="word.text">
                <th scope="row">
                  {{ word.text }}
                </th><td>{{ number(word.count) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <figcaption>English alphanumeric words, counted once per description. Common words removed. This view does not represent every language.</figcaption>
    </template>
  </figure>
</template>

<style scoped>
.study-chart { margin-block: 2.5rem; padding: clamp(1rem, 3vw, 2rem); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg); color: var(--ui-text); }
.study-chart h3 { margin: 0; font-size: 1.35rem; font-weight: 600; line-height: 1.4; letter-spacing: -.03em; }
.study-note, .study-chart figcaption { margin-top: .75rem; color: var(--ui-text-muted); font-size: .875rem; line-height: 1.6; }
.study-band { margin-top: 1.5rem; }
.study-row-label { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; font-size: .9rem; }
.study-number, .study-axis, .study-stats dd { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.study-track { display: flex; height: 1.15rem; margin-top: .65rem; background: var(--ui-bg-accented); }
.study-track > span { display: block; height: 100%; }
.study-green { background: #15803d; }
.study-amber { background: #b45309; }
.study-red { background: #be123c; }
.study-clear { background: #57534e; }
.study-uncertain { background: #a8a29e; }
.study-axis { display: flex; justify-content: space-between; gap: 1rem; margin-top: .8rem; font-size: .7rem; color: var(--ui-text-muted); }
.study-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 2rem; }
.study-stats dt { color: var(--ui-text-muted); font-size: .8rem; }
.study-stats dd { margin-top: .4rem; font-size: 1rem; }
.study-table { overflow-x: auto; margin-top: 1.5rem; }
.study-table:focus-visible, summary:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 3px; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: .8rem; }
th, td { padding: .9rem .7rem; border-bottom: 1px solid var(--ui-border); vertical-align: top; }
th { font-weight: 500; }
thead th { font-family: var(--font-mono); color: var(--ui-text-muted); font-size: .7rem; }
td { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
td small { display: block; margin-top: .25rem; color: var(--ui-text-muted); font-size: .65rem; white-space: nowrap; }
.study-mini-track { display: block; height: .3rem; width: 5rem; margin-top: .4rem; background: var(--ui-bg-accented); }
.study-mini-track > span { display: block; height: 100%; background: var(--ui-text-muted); }
.study-legend { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1.25rem; font-size: .8rem; }
.study-legend span { display: flex; align-items: center; gap: .4rem; }
.study-legend i { display: inline-block; width: .65rem; height: .65rem; }
.study-cloud { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: .35rem 1rem; padding-block: 2rem; line-height: 1.25; }
.study-cloud span { font-weight: 500; }
summary { min-height: 44px; padding-block: .7rem; cursor: pointer; font-size: .9rem; }
@media (max-width: 480px) { .study-stats { grid-template-columns: 1fr; gap: .75rem; } .study-stats div { display: flex; justify-content: space-between; gap: 1rem; } .study-stats dd { margin: 0; } }
@media (min-width: 1024px) { .study-chart { width: calc(100% + 12rem); max-width: none; margin-left: -6rem; } }
</style>
