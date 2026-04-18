- [x] use orz markdown extension as the parser engine instead of install it separately. the markdown extension identifier is 'yuwang26.orz-md-preview'
- [x] Add switch between source view and rendered view. 
- [x] Important: allow copy source code
    - [x] solidify for all plugins, now works for 'span' plugin. no need for test-plugin, and whole toc, but not hurt to include them. 
- [x] allow user to create a 'custom.css' file in the same folder as the '.md.html' file to keep the general settings for a whole workspace. The rules in the 'custom.css' will overide the rules embedded in individual '.md.html' file. This can be used in the situations when user want to create a series of webpages and save them in the same folder. User then can choose a default font size to apply to all pages. even if an individual page has a font size setting differently, it will be overided. The pages in this workspace will look consistent when served to public viewers. Font size is just one example. User can also add other settings to this 'custom.css' to unify the whole workspace and add or modify some specific settings beyond the selected theme. For example, use a different maintext font instead of the theme default one; add a customized div element and show it in a special way; etc. (This does not work for local file serving but only for http or https web serving)



