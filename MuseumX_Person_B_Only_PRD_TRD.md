# MuseumX --- Person B

## Product Requirements Document (PRD) and Technical Requirements Document (TRD)

### Q-Learning Slot Recommender

**Project:** MuseumX --- Smart Museum Ticket Booking System\
**Role:** Person B --- Q-learning recommender and project documentation\
**Scope:** Person B's enhancement tasks only\
**Estimated effort:** About 5 hours, excluding optional work

------------------------------------------------------------------------

# Part I --- Product Requirements Document (PRD)

## 1. Purpose

Enhance the existing MuseumX chatbot booking flow with a
Q-learning-based slot recommender. After a visitor selects a time slot,
the system evaluates its occupancy and uses a trained policy to decide
whether to keep the requested slot or suggest a quieter earlier or later
slot.

The visitor must be able to accept the suggested alternative or keep the
originally selected slot.

## 2. Scope

Person B is responsible for:

1.  Writing and running `ml/train.mjs`.
2.  Generating and committing `qpolicy.json`.
3.  Writing `usePolicy.js`.
4.  Adding the recommendation step to the chatbot after slot selection.
5.  Calculating occupancy using `booked ÷ capacity`.
6.  Finding the nearest quieter slot in the direction recommended by the
    policy.
7.  Providing **Accept** and **Keep** choices.
8.  Optionally adding a policy heatmap to the admin dashboard.
9.  Adding an **AR/VR and AI Features** section to the README.
10. Adding the course-concept table to the project report.

This document covers Person B only. It does not specify Person A's 3D
viewer or Cardboard implementation.

## 3. Goals

-   Train a tabular Q-learning agent for museum time-slot
    recommendations.
-   Produce a reusable `qpolicy.json` policy file.
-   Use the generated policy in the existing chatbot.
-   Detect crowded slots using their booked count and capacity.
-   Suggest the nearest quieter slot when the learned policy recommends
    an earlier or later slot.
-   Let visitors accept the recommendation or keep their original
    selection.
-   Preserve the existing booking flow if a recommendation cannot be
    made.
-   Document the AI feature and relevant course concepts.

## 4. Users

### Museum visitor

-   Selects a preferred date and time slot.
-   Receives a quieter-slot suggestion when appropriate.
-   Can accept the alternative or keep the selected slot.

### Museum administrator

-   May view the learned policy through an optional dashboard heatmap.

## 5. Functional requirements

### FR-1: Slot occupancy calculation

Calculate the selected slot's load as:

`load = booked / capacity`

Handle missing or invalid values safely. Do not divide by zero.

### FR-2: State representation

Represent the current state using:

-   **Day type:** `weekday`, `weekend`, or `holiday`.
-   **Load bucket:**
    -   `low`: below 50%.
    -   `medium`: 50% to 80%.
    -   `high`: above 80%.

Use the same bucket boundaries in training and runtime code. Recommended
exact boundaries:

-   Low: `load < 0.50`
-   Medium: `load >= 0.50 && load <= 0.80`
-   High: `load > 0.80`

### FR-3: Q-learning policy

Use the trained policy to select one of these actions:

-   `keep`
-   `earlier`
-   `later`

The chatbot must use the generated `qpolicy.json` policy. Do not replace
the learned policy with a separate hardcoded recommendation rule.

### FR-4: Find a quieter alternative

When the policy returns `earlier` or `later`:

-   Search in the recommended direction.
-   Find the nearest slot whose occupancy is lower than the originally
    selected slot.
-   Respect the existing slot availability and booking rules.
-   Do not suggest a slot that is equally or more crowded.
-   If no suitable alternative exists, retain the original selection and
    continue safely.

### FR-5: Recommendation message

When a suitable alternative is found, show a chatbot message explaining
that the selected slot is crowded and presenting the quieter
alternative.

Provide two choices:

-   **Accept:** change the selected booking slot to the recommended
    alternative.
-   **Keep:** retain the originally selected slot.

### FR-6: Accept recommendation

When the visitor accepts:

-   Update the selected slot in the existing booking state.
-   Ensure the next booking step uses the accepted slot.
-   Ensure the booking summary reflects the accepted slot.

### FR-7: Keep original slot

When the visitor chooses Keep:

-   Preserve the originally selected slot.
-   Continue the existing booking flow.
-   Do not overwrite the original slot with the suggested alternative.

### FR-8: Safe fallback

If the policy is unavailable, invalid, has no matching state, or no
quieter alternative can be found, preserve the original selection and
allow the existing booking flow to continue.

### FR-9: Optional policy heatmap

If time permits, add a policy heatmap to the admin dashboard. It should
show the learned action for each day-type and load-bucket combination.

The heatmap must use the generated policy data rather than a separately
hardcoded set of recommendations.

### FR-10: Documentation

Update the project README with an **AR/VR and AI Features** section and
add the relevant course-concept table to the project report.

Person B's documentation should accurately describe the Q-learning
recommender. Team-level AR/VR descriptions should reflect the features
actually implemented by the team.

## 6. Q-learning model requirements

### State

The state is made up of:

-   Day type: weekday, weekend, holiday.
-   Requested-slot occupancy: low, medium, high.

### Actions

-   Keep the requested slot.
-   Suggest an earlier slot.
-   Suggest a later slot.

### Reward design

Use the reward design specified for the project:

  Situation                                                    Reward
  ---------------------------------------------------------- --------
  Keep at low load                                                 +1
  Keep at high load                                                -1
  Suggest at high load when the alternative has lower load         +1
  Suggest at low load                                            -0.5
  Suggested alternative is also high load                          -1

The handling of medium-load cases must be explicitly defined in the
training script and documented. Training and runtime behaviour must
remain consistent with the policy.

### Training approach

-   Tabular Q-learning.
-   Epsilon-greedy action selection.
-   Learning rate: `0.1`.
-   Discount factor: `0.9`.
-   A few thousand training episodes.
-   Simulated visitor arrivals, with demand peaks around midday and
    weekends.
-   Export the best action and Q-values for each state to
    `qpolicy.json`.

## 7. Acceptance criteria

Person B's core feature is complete when:

1.  `ml/train.mjs` runs successfully.
2.  The script generates a valid `qpolicy.json`.
3.  The policy contains the supported day-type and load-bucket states.
4.  The policy provides a valid action and Q-values for each state.
5.  `usePolicy.js` can read and query the generated policy.
6.  Occupancy is correctly calculated from booked count divided by
    capacity.
7.  A crowded selected slot can trigger a recommendation.
8.  The alternative is in the direction selected by the policy and has
    lower occupancy.
9.  Accept updates the selected booking slot.
10. Keep preserves the original selected slot.
11. Missing policy data or unavailable alternatives do not break the
    existing booking flow.
12. README and project report are updated.
13. The generated policy file is committed to the repository.

The policy heatmap is optional.

------------------------------------------------------------------------

# Part II --- Technical Requirements Document (TRD)

## 8. Technical overview

Person B will implement a small machine-learning training pipeline and
integrate its generated policy into the existing chatbot.

Suggested files:

``` text
client/
└── src/
    └── ml/
        ├── train.mjs
        ├── qpolicy.json
        └── usePolicy.js
```

Adapt the location to the existing repository structure. Inspect the
project first and avoid creating duplicate folders or files.

## 9. Training script --- `ml/train.mjs`

### Responsibilities

The training script must:

1.  Define the state space.
2.  Define the action space.
3.  Initialize the Q-table.
4.  Simulate visitor arrivals and slot occupancy.
5.  Select actions using epsilon-greedy exploration.
6.  Calculate rewards according to the defined reward design.
7.  Update Q-values using the Q-learning update rule.
8.  Train for a few thousand episodes.
9.  Select the best action for every supported state.
10. Export the policy and Q-values to `qpolicy.json`.

### Q-learning update rule

Use the tabular Q-learning formula:

`Q(s, a) = Q(s, a) + α [r + γ max Q(s', a') - Q(s, a)]`

Where:

-   `s`: current state.
-   `a`: selected action.
-   `r`: reward.
-   `s'`: next state.
-   `α`: learning rate (`0.1`).
-   `γ`: discount factor (`0.9`).

Use epsilon-greedy action selection. Make the episode count and
exploration schedule explicit in the script.

### Simulation

Simulate visitor arrivals using a demand pattern with peaks around
midday and on weekends. The simulation should expose the agent to the
supported day types and occupancy buckets.

### Policy output

The script must generate `qpolicy.json`.

Suggested structure:

``` json
{
  "metadata": {
    "algorithm": "tabular-q-learning",
    "learningRate": 0.1,
    "discountFactor": 0.9,
    "episodes": 3000
  },
  "policy": {
    "weekday_low": {
      "action": "keep",
      "qValues": {
        "keep": 0.0,
        "earlier": 0.0,
        "later": 0.0
      }
    }
  }
}
```

This is an illustrative schema. The actual generated file must contain
every supported state and the values produced by the training run. Keep
the schema consistent with `usePolicy.js`.

## 10. Runtime policy module --- `usePolicy.js`

### Responsibilities

-   Load or import `qpolicy.json`.
-   Normalize the day type.
-   Convert occupancy into the correct load bucket.
-   Construct the state key using the same convention as the training
    script.
-   Retrieve the learned action.
-   Validate the returned action.
-   Fall back safely if the policy is missing or invalid.

### Suggested interface

``` js
recommend({ dayType, load })
```

Expected return value:

``` text
'keep' | 'earlier' | 'later'
```

Follow the existing project's module conventions. Use a plain utility
module unless the existing architecture specifically requires a React
hook.

## 11. Chatbot integration

### Integration point

Add the recommendation step immediately after slot selection and before
the existing booking flow continues.

Inspect the current chatbot flow and follow its existing
state-transition and message conventions. Do not rewrite unrelated
chatbot logic.

### Runtime sequence

1.  Visitor selects a time slot.
2.  Existing application obtains the slot's booked count and capacity.
3.  Calculate the slot occupancy.
4.  Determine the day type.
5.  Query the learned policy through `usePolicy.js`.
6.  If the action is `keep`, continue the existing flow.
7.  If the action is `earlier` or `later`, search for the nearest
    quieter slot in that direction.
8.  If a suitable alternative exists, display Accept and Keep choices.
9.  Apply the visitor's choice to the existing booking state.
10. Continue the original booking flow.

### Alternative selection logic

-   Search only in the direction returned by the policy.
-   Compare candidate occupancy against the originally selected slot.
-   Select the nearest candidate with strictly lower occupancy.
-   Respect the existing application's availability and capacity rules.
-   Do not invent slots or change backend capacity data from the
    frontend.
-   If no suitable candidate exists, preserve the original selection.

### Booking-state integrity

The selected slot in the existing booking state must remain the source
of truth.

-   On Accept, update it to the recommended alternative.
-   On Keep, retain the original slot.
-   Ensure the booking summary and subsequent booking request use the
    final selected slot.

## 12. Optional admin policy heatmap

### Purpose

Visualize the learned policy in the existing admin dashboard.

### Layout

-   Rows: weekday, weekend, holiday.
-   Columns: low, medium, high occupancy.
-   Cell content: learned action (`keep`, `earlier`, `later`).

### Requirements

-   Read from the generated `qpolicy.json`.
-   Clearly label day types and occupancy buckets.
-   Include a legend for the three actions.
-   Handle missing policy data safely.
-   Follow the existing admin dashboard design.

This feature is optional and must not delay the core recommender.

## 13. Documentation

### README

Add an **AR/VR and AI Features** section that documents:

-   The Q-learning slot recommender.
-   State representation.
-   Available actions.
-   Reward design.
-   Training script and generated policy.
-   How the chatbot uses the recommendation.
-   How to run the training script.

Include team-level AR/VR details only as implemented and verified by the
team.

### Project report

Add a course-concept table covering the implemented concepts, including:

  -----------------------------------------------------------------------
  Course concept                      Project application
  ----------------------------------- -----------------------------------
  Q-learning                          Learning a slot recommendation
                                      policy

  Reinforcement learning              State, action, reward and policy
                                      learning

  Epsilon-greedy strategy             Balancing exploration and
                                      exploitation

  Policy visualization                Optional admin heatmap showing
                                      learned actions
  -----------------------------------------------------------------------

Do not claim optional work as completed unless it has actually been
implemented.

## 14. Error handling and fallback

Handle:

-   Missing or malformed `qpolicy.json`.
-   Unknown day type.
-   Missing or invalid booked count.
-   Zero or invalid capacity.
-   Missing policy state.
-   Invalid policy action.
-   No alternative slot in the recommended direction.
-   Alternative slot that is not quieter.
-   Slot API failure.

The safe fallback is to preserve the original selected slot and continue
the existing booking flow.

## 15. Testing requirements

### Training tests

-   Run `train.mjs` successfully.
-   Confirm `qpolicy.json` is generated.
-   Confirm the output parses as valid JSON.
-   Confirm every supported state is present.
-   Confirm each action is `keep`, `earlier`, or `later`.
-   Confirm Q-values are included.

### Runtime tests

-   Verify low, medium and high load classification.
-   Verify weekday, weekend and holiday state keys.
-   Verify policy lookup for each supported state.
-   Verify safe fallback when policy data is unavailable.

### Chatbot tests

-   A crowded slot can trigger the recommendation step.
-   The alternative is in the policy's recommended direction.
-   The alternative has lower occupancy.
-   Accept changes the selected slot.
-   Keep preserves the original slot.
-   No suitable alternative does not break the booking flow.
-   The booking summary uses the final selected slot.
-   Existing English and Hindi flows remain functional.

### Joint application tests

Coordinate with Person A for the final team test:

-   Run the demo in both languages.
-   Test the integrated chatbot flow.
-   Test the packaged Electron application.
-   Confirm the policy file is available in the packaged application.
-   Confirm no unnecessary CDN or network dependency is introduced for
    policy loading.

## 16. Collaboration and Git workflow

Person B's branch:

``` text
feature/ml-recommender
```

Person A's branch:

``` text
feature/vr-viewer
```

Collaboration rules:

-   Keep changes focused and commit small increments.
-   Person B works on the recommendation step in the chatbot flow.
-   Person A works on the 3D preview step in the chatbot flow.
-   Avoid overwriting each other's changes in the shared chatbot flow
    file.
-   Merge small changes frequently through pull requests.
-   Coordinate changes to shared files.
-   Do not push unfinished work directly to `main`.

The shared `ExhibitViewer` component props are not a dependency for
Person B.

## 17. Definition of done --- Person B

Person B's core work is complete when:

-   [ ] `ml/train.mjs` trains successfully.
-   [ ] `qpolicy.json` is generated and committed.
-   [ ] `usePolicy.js` reads and queries the generated policy.
-   [ ] The chatbot evaluates occupancy after slot selection.
-   [ ] A crowded slot can trigger a learned recommendation.
-   [ ] The nearest quieter slot in the recommended direction is
    selected.
-   [ ] Accept changes the booking's selected slot.
-   [ ] Keep preserves the original selected slot.
-   [ ] The existing booking flow remains functional when no
    recommendation is available.
-   [ ] README contains the AR/VR and AI Features section.
-   [ ] Project report contains the course-concept table.
-   [ ] The feature is tested in both languages and in the joint
    Electron demo.

**Optional:** Admin policy heatmap.

------------------------------------------------------------------------

## Implementation note

This document is strictly scoped to Person B's Q-learning recommender
and documentation responsibilities. It intentionally excludes payment
features and Person A's implementation tasks.

Before changing code, inspect the existing repository and adapt file
paths, slot data fields, chatbot transitions, module exports and
Electron asset paths to the actual project. The illustrative JSON and
function signatures above are proposed interfaces, not claims about the
current codebase.
