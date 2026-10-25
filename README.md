# Built with AI

🧠 Explore math and artificial intelligence through interactive, visual learning tools built with Copilot, ChatGPT, or Claude.

This collection turns abstract ideas into hands-on experiments. Change an input, compare the results, and discover the reasoning behind what you see—from the shape of a dataset to the way AI represents numbers and processes text.

The single-file pages focus on one topic, pairing interactive examples with short explanations. The Apps category contains multi-file projects with their own setup instructions. Pick a subject below and start exploring. ✨

## 🧮 Math

Build intuition for numbers, statistics, and probability by experimenting with representations, datasets, and random outcomes.

### [🔢 Numbers](./math/number-lab.html)

Discover the difference between a number and the numeral used to write it. Explore how different numeral systems and positional bases can represent the same quantity.

### [📊 Stats](./math/stat-studio.html)

Make sense of a dataset through visualizations and statistical summaries. Explore its distribution and spread, and connect the patterns you see with the math behind them.

### [📈 Distribution](./math/distribution-lab.html)

See the shape of your data by entering your own numbers or trying a sample dataset. Explore its center and percentiles to understand how values are distributed.

### [🎯 Percentile](./math/percentile-calculator.html)

Find the value at a chosen percentile and follow how it is calculated. Compare nearest-rank and linear interpolation methods to see how the calculation affects the result.

### [🎲 Chances](./math/chance-lab.html)

Explore the law of large numbers through repeated random trials. Set outcome probabilities, run an experiment, and compare observed frequencies with expected probabilities as the sample grows.

### [🔗 Correlation](./math/correlation-lab.html)

Explore how two sets of values move together with illustrative examples and your own data. Visualize relationships, compare correlations, and remember that a pattern alone does not prove causation.

## 🤖 AI

Explore some of the building blocks behind AI, from turning text into token IDs to predicting sequences, accelerating generation, and storing numbers with limited precision.

### [🔤 Tokenization](./ai/token-lab.html)

Watch text become tokens and numeric IDs as you type. Customize a vocabulary and explore how a tokenizer maps pieces of text to entries in its dictionary.

### [🔮 Sequence Predictor](./ai/sequence-predictor.html)

Teach a simple predictor with number sequences, then see what it expects to come next. Explore how repeated patterns and changes between numbers contribute to its predictions and their percentages.

### [⚡ Speculative Decoding](./ai/speculative-decoding.html)

Explore how a small draft model and a larger target model can work together to accelerate text generation. Three interactive labs explain draft verification, distribution-preserving sampling, and when the approach pays off.

### [🧮 Number Representations](./ai/number-lab.html)

See how AI number formats trade precision for storage space. Enter a value, compare its bit layouts and rounding errors across formats, or build a custom floating-point format to explore the trade-offs yourself.

### [🗃️ Prompt Cache Explorer](./ai/prompt-cache-explorer.html)

See how language models can reuse computation when prompts share the same beginning. Compare prompts to explore cached prefixes, token blocks, and how cache reuse can reduce repeated work.

## 🗄️ Data & Storage

Get hands-on with the ways data is organized and accessed, and see how a storage choice can change the work needed to answer a query.

### [📚 Row vs. Column Storage Lab](./database/row-vs-column.html)

Create and edit a small table, run a simple `SELECT` query, and compare the cells read in row-oriented and column-oriented storage. Explore how selecting a few columns or filtering rows changes the amount of data each layout needs to access.

### [🪵 Parquet Explorer](./database/parquet-explorer.html)

Explore Parquet's columnar file structure with interactive queries. See how row groups, column chunks, pages, and min/max statistics affect which data is examined, and compare value encodings—plain, dictionary, run-length, and delta—on sample columns or your own values.

## 🛠️ Apps

Explore larger, multi-file applications in the [apps folder](./apps/). Unlike the standalone HTML pages above, these projects have their own source files and runtime requirements. Follow each app's README to run it locally.

### [✨ GenUI Lab](./apps/genui/)

Compare two ways to turn the same prompt into an interactive interface: composing predefined components and actions from structured JSON, or generating HTML, CSS, and JavaScript. Inspect requests, responses, schemas, source, and execution state to understand how each approach works. Try deterministic examples in Demo mode, or connect Azure OpenAI for live generation; generated JavaScript runs only after an explicit Run action in a sandboxed preview.

Requires Node.js 22.9+ with no dependency installation. See the [GenUI setup and walkthrough](./apps/genui/README.md) to get started.