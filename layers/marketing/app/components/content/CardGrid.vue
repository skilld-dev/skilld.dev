<template>
  <div class="[&>ul]:grid [&>ul]:list-none [&>ul]:gap-3 [&>ul]:p-0 sm:[&>ul]:grid-cols-2 [&>ul>li]:rounded-lg [&>ul>li]:border [&>ul>li]:border-default [&>ul>li]:p-4 [&>ul>li]:transition-colors [&>ul>li:hover]:bg-muted/50 [&_a]:block [&_a]:font-medium [&_a]:no-underline">
    <slot />
  </div>
</template>
