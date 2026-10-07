import {
  getBucketList,
  addToBucketList,
  removeFromBucketList,
} from "./state.js";

const elements = {
  bucketCount:
    document.getElementById(
      "bucketCount"
    ),

  latestDestination:
    document.getElementById(
      "latestDestination"
    ),

  latestDestinationCountry:
    document.getElementById(
      "latestDestinationCountry"
    ),

  bucketForm:
    document.getElementById(
      "bucketForm"
    ),

  destinationName:
    document.getElementById(
      "destinationName"
    ),

  destinationCountry:
    document.getElementById(
      "destinationCountry"
    ),

  destinationNote:
    document.getElementById(
      "destinationNote"
    ),

  bucketGrid:
    document.getElementById(
      "bucketGrid"
    ),

  emptyState:
    document.getElementById(
      "emptyState"
    ),

  toast:
    document.getElementById(
      "toast"
    ),
};

let toastTimer = null;

init();

function init() {
  bindEvents();
  render();
}

function bindEvents() {
  elements.bucketForm
    ?.addEventListener(
      "submit",
      handleAddDestination
    );

  elements.bucketGrid
    ?.addEventListener(
      "click",
      handleBucketAction
    );
}

function handleAddDestination(
  event
) {
  event.preventDefault();

  const name =
    clean(
      elements.destinationName
        ?.value
    );

  const country =
    clean(
      elements.destinationCountry
        ?.value
    );

  const note =
    clean(
      elements.destinationNote
        ?.value
    );

  if (!name) {
    showToast(
      "Enter a destination first."
    );

    elements.destinationName
      ?.focus();

    return;
  }

  const before =
    getBucketList();

  const existing =
    findDestination(
      before,
      name,
      country
    );

  if (existing) {
    showToast(
      `${name} is already in your Bucket List.`
    );

    return;
  }

  const record =
    addToBucketList(
      {
        name,
        country,
      },
      {
        note,
        source:
          "Bucket List",
      }
    );

  if (!record) {
    showToast(
      "Destination could not be saved."
    );

    return;
  }

  elements.bucketForm
    ?.reset();

  render();

  showToast(
    `${name} added to your Bucket List.`
  );
}

function handleBucketAction(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const action =
    button.dataset.action;

  const id =
    button.dataset.id;

  if (!id) {
    return;
  }

  const item =
    getBucketList().find(
      entry =>
        entry.id === id
    );

  if (!item) {
    render();
    return;
  }

  if (
    action === "remove"
  ) {
    removeDestination(
      item
    );

    return;
  }

  if (
    action === "plan"
  ) {
    planDestination(
      item
    );
  }
}

function removeDestination(
  item
) {
  const name =
    clean(
      item?.destination?.name
    ) ||
    "this destination";

  const confirmed =
    window.confirm(
      `Remove ${name} from your Bucket List?`
    );

  if (!confirmed) {
    return;
  }

  const removed =
    removeFromBucketList(
      item.id
    );

  if (!removed) {
    showToast(
      "Destination could not be removed."
    );

    return;
  }

  render();

  showToast(
    `${name} removed from your Bucket List.`
  );
}

function planDestination(
  item
) {
  const destination =
    item?.destination;

  const name =
    clean(
      destination?.name
    );

  const country =
    clean(
      destination?.country
    );

  if (!name) {
    return;
  }

  const plannerDestination = {
    name,
    country,

    countryCode:
      clean(
        destination?.countryCode
      ),

    latitude:
      numberOrNull(
        destination?.latitude
      ),

    longitude:
      numberOrNull(
        destination?.longitude
      ),
  };

  try {
    sessionStorage.setItem(
      "trackworld-planner-destination-v1",
      JSON.stringify(
        plannerDestination
      )
    );
  } catch {
    // Planner can still be opened.
  }

  window.location.href =
    `/?destination=${encodeURIComponent(
      name
    )}`;
}

function render() {
  const items =
    getBucketList()
      .slice()
      .sort(
        (a, b) =>
          Number(
            b?.addedAt ?? 0
          ) -
          Number(
            a?.addedAt ?? 0
          )
      );

  renderSummary(
    items
  );

  renderGrid(
    items
  );
}

function renderSummary(
  items
) {
  if (
    elements.bucketCount
  ) {
    elements.bucketCount
      .textContent =
      String(
        items.length
      );
  }

  const latest =
    items[0];

  if (!latest) {
    setText(
      elements.latestDestination,
      "—"
    );

    setText(
      elements.latestDestinationCountry,
      "Add a destination to get started"
    );

    return;
  }

  setText(
    elements.latestDestination,
    clean(
      latest?.destination
        ?.name
    ) ||
      "Destination"
  );

  setText(
    elements.latestDestinationCountry,
    clean(
      latest?.destination
        ?.country
    ) ||
      "Saved destination"
  );
}

function renderGrid(
  items
) {
  if (
    !elements.bucketGrid ||
    !elements.emptyState
  ) {
    return;
  }

  if (!items.length) {
    elements.bucketGrid
      .innerHTML = "";

    elements.emptyState
      .hidden = false;

    return;
  }

  elements.emptyState
    .hidden = true;

  elements.bucketGrid
    .innerHTML =
    items
      .map(
        renderBucketCard
      )
      .join("");
}

function renderBucketCard(
  item
) {
  const destination =
    item?.destination ??
    {};

  const name =
    clean(
      destination.name
    ) ||
    "Destination";

  const country =
    clean(
      destination.country
    );

  const note =
    clean(
      item?.note
    );

  const added =
    formatAddedDate(
      item?.addedAt
    );

  return `
    <article class="bucket-card">
      <div class="bucket-card-content">

        <p class="bucket-card-label">
          DREAM DESTINATION
        </p>

        <h3>
          ${escapeHtml(name)}
        </h3>

        <p class="bucket-country">
          ${
            country
              ? escapeHtml(country)
              : "Travel destination"
          }
        </p>

        ${
          note
            ? `
              <p class="bucket-note">
                ${escapeHtml(note)}
              </p>
            `
            : `
              <p class="bucket-note">
                Added ${escapeHtml(added)}
              </p>
            `
        }

        <div class="bucket-actions">
          <button
            class="card-button plan"
            type="button"
            data-action="plan"
            data-id="${escapeAttribute(
              item.id
            )}"
          >
            Plan trip →
          </button>

          <button
            class="card-button"
            type="button"
            data-action="remove"
            data-id="${escapeAttribute(
              item.id
            )}"
          >
            Remove
          </button>
        </div>

      </div>
    </article>
  `;
}

function findDestination(
  items,
  name,
  country
) {
  const wantedName =
    clean(name)
      .toLowerCase();

  const wantedCountry =
    clean(country)
      .toLowerCase();

  return items.find(
    item => {
      const itemName =
        clean(
          item?.destination
            ?.name
        ).toLowerCase();

      const itemCountry =
        clean(
          item?.destination
            ?.country
        ).toLowerCase();

      if (
        itemName !==
        wantedName
      ) {
        return false;
      }

      if (
        !wantedCountry
      ) {
        return true;
      }

      return (
        itemCountry ===
        wantedCountry
      );
    }
  );
}

function formatAddedDate(
  value
) {
  const timestamp =
    Number(value);

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return "recently";
  }

  const date =
    new Date(
      timestamp
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "recently";
  }

  return date
    .toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
}

function showToast(
  message
) {
  if (
    !elements.toast
  ) {
    return;
  }

  elements.toast
    .textContent =
    message;

  elements.toast
    .classList.add(
      "show"
    );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(
      () => {
        elements.toast
          ?.classList.remove(
            "show"
          );
      },
      2600
    );
}

function setText(
  element,
  value
) {
  if (!element) {
    return;
  }

  element.textContent =
    value;
}

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function numberOrNull(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function escapeAttribute(
  value
) {
  return escapeHtml(
    value
  );
}