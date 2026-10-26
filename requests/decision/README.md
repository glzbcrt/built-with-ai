# 🧠 Decision API request examples

Two HTTP request collections demonstrate structured decision and classification workloads in Microsoft Foundry. They use matching order-fulfillment and incident-response scenarios so you can compare how each API expresses predicates, choices, scores, and multiple questions in a single request.

## 📁 Files

### 🎞️ Decision models slide deck

Open [Decision Models: From Chat to Judgment](./deck.html) for a short Reveal.js
presentation that introduces decision models: models that evaluate text or JSON
against bounded questions and return typed answers with probabilities, rather
than generating free-form text.

The deck covers:

- **Jev:** TypeSafe AI's first System One model, used as the starting point to explain what decision models are and why the "System One" name refers to fast, focused judgments.
- **Question types:** true/false predicates (`predicate` or `noul`), choices, and scores, including how probabilities are returned and how scores are computed.
- **How they work:** published concepts such as parallel evaluation of questions and training for calibrated decisions, clearly separated from details that have not been disclosed.
- **Microsoft-Decision-1:** the Microsoft Foundry decision model, called through `POST /providers/microsoft/v1/systemone` with a `state` and a `questions` object.
- **OpenAI Decisions API:** the Azure OpenAI decisions endpoint, called through `POST /openai/v1/decisions` with an `input` and a `questions` array.
- **Side-by-side examples:** the same order-eligibility request in both APIs, a schema comparison, and an incident-response walkthrough.
- **Practical guidance:** composing atomic questions in code, setting thresholds, and keeping policy checks and human approval outside the model.

Jev is a TypeSafe AI model; Microsoft-Decision-1 and the OpenAI Decisions API are separate offerings. The deck does not claim they share an architecture or training method.

### HTTP collections

| File | API | Endpoint | Model |
| --- | --- | --- | --- |
| [openai-decisions.http](./openai-decisions.http) | Azure OpenAI Decisions API | `POST /openai/v1/decisions` | `gpt-6-luna`, as specified in the examples |
| [microsoft-decision-1.http](./microsoft-decision-1.http) | Microsoft-Decision-1 | `POST /providers/microsoft/v1/systemone` | Your deployment name, supplied through `@deployment` |

These are example requests, not recorded responses or a benchmark. Confirm model availability, deployment requirements, and authentication against the linked documentation before running them.

## 🛠️ Setup and usage

1. Have a Microsoft Foundry resource with access to the model and API you want to call.
2. Open either HTTP file in a client that supports `@variable` declarations, `{{variable}}` substitution, and `###` request separators, such as the REST Client extension for VS Code.
3. Configure the variables at the top of the selected file:
   - `@baseUrl`: replace `YOUR-FOUNDRY-RESOURCE` with your resource name. Keep `/openai/v1` in the OpenAI collection's base URL; the Microsoft-Decision-1 collection uses the resource host without that suffix.
   - `@deployment`: in the Microsoft-Decision-1 collection, replace `YOUR_DEPLOYMENT_NAME` with your model deployment name.
   - `@apiKey`: supply a valid credential using your client's local secret or environment configuration.
4. Configure authentication for every request you intend to send. The files currently contain the placeholder `Authorization: ******`; they do not reference `@apiKey` in their headers, so setting that variable alone does not authenticate a request. Replace the placeholder with the authentication header required by the selected API, following its documentation.
5. For the OpenAI collection, confirm that the `model` value in each request matches the model or deployment required by your resource.
6. Send an individual request and inspect its response in your HTTP client.

🔐 Do not commit real API keys or tokens. Calls use your Azure resource and may incur charges.

## 🎯 Included scenarios

Both files contain the same five examples:

| Request | Scenario | Questions |
| --- | --- | --- |
| 1 | 📦 Express fulfillment eligibility | A predicate about inventory, destination, and risk |
| 2 | 🚚 Fulfillment action selection | A choice between nearby express shipping, distant standard shipping, backorder, and manual review |
| 3 | ⏱️ Fulfillment urgency | A score using ordered criteria from low to critical |
| 4 | 🧩 Combined order decisions | Fraud-review predicate, next-action choice, and fulfillment-risk score |
| 5 | 🚨 Incident-response triage | Production-impact and rollback-evidence predicates, specialist and diagnostic-step choices, and a severity score |

The incident example asks for a safe diagnostic next step, not execution of remediation. It explicitly states that rollback requires human approval.

## ⚖️ Request format comparison

The collections express similar questions using different schemas; their payloads are not interchangeable.

| Concept | Azure OpenAI Decisions API | Microsoft-Decision-1 |
| --- | --- | --- |
| Context to evaluate | `input` | `state` |
| Question collection | `questions` array; each question has a `name` | `questions` object keyed by question name |
| Predicate question type | `predicate` | `noul` |
| Choice options | `choices` array with `value` and `description` | `criteria` object mapping option keys to descriptions |
| Score scale | `levels` array with `label` and `description` | `criteria` array of ordered descriptions |

Each question includes `instructions` describing the decision to make. The combined examples place several questions alongside the same context in one request.

## 📚 References

- [Azure OpenAI Decisions API: Now generally available in Microsoft Foundry | Microsoft Community Hub](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-openai-decisions-api-now-generally-available-in-microsoft-foundry/4567265)
- [Introducing Microsoft-Decision-1 in Microsoft Foundry for decision and classification workloads | Microsoft Community Hub](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-microsoft-decision-1-in-microsoft-foundry-for-decision-and-classific/4562742)
- [OpenAI Decisions API guide](https://developers.openai.com/api/docs/guides/decisions)
- [Use Microsoft-Decision-1 in Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision)
