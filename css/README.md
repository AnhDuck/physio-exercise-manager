# CSS Load Order

CSS files are loaded manually from `index.html` with `PEM_APP_VERSION` cache-busting. There is no CSS build step or bundler.

Add new feature styles to the matching numbered file. Keep the load order stable because it is part of the cascade.

`66-home-cards.css` owns the main-screen dashboard card row, Weather card, ActivityWatch mini card, and the related card settings controls.

Responsive overrides belong in `90-responsive.css` unless a future refactor intentionally changes that policy.
