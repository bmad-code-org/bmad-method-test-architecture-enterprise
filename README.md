# Template Instructions

After creating a new repo from the template, in the ide or terminal of your choice, first run npm install (or pnpm install if using that instead of npm).

## Update README.md and docs folders

Update this readme with the real purpose and details of your custom module - remove all of this current info.

If you need extensive docs, you can add more to the docs folder at project root. For BMad projects - we will continue to follow the diataxis format with llmstxt and docs published site support.

## Update package.json

Aside from potentially adding to the packages.json due to a need for custom installer routines, you need to update the following fields in the file:

name. description, keywords array, repository.url, version

## Actual Module Contents src Folder

All module contents goes under src directly by convention. If you plan to house more than one module in the repo though, you can use sub folders (src/module1, src/module2). if not all content goes right under src.

The src folder

### src/module.yaml (or src/[module-name]/module.yaml)

This is the same standard convention followed by any BMad module.

If you are creating this from scratch, note that the module.yaml aside from making your module installable via the BMad installer, and buildable to other targets and tools, it also serves as the primary mechanism to define what install questions get asked along with what the default values are.

### All other module conventions still apply:

- agents folder - All bmad agents go under this folder or a agent named subfolder under the folder
- workflows - All workflows an agent might use or people can call directly go here
- tools - really similar to workflows, the main distinction being more conceptual - tools are small and do 1 thing well and are contained within a single prompt file.
  - Consider a tool for when you might have multiple workflows use it. Not required,
- - - you can have any other folders as needed also within the repo, along with other tools
- ensure all content in workflows and agents are using relative paths to each other. This will help with future compatibility to conversion to other formats like Claude skills and similar.
