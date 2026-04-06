import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { icons } from './icons';
import { Card } from 'fumadocs-ui/components/card';
import React from 'react';
import { ArchitectureDiagram, DepositDiagram, TradeDiagram } from './diagrams';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ArchitectureDiagram,
    DepositDiagram,
    TradeDiagram,
    Card: (props: any) => {
      const IconComponent = props.icon ? icons[props.icon as keyof typeof icons] : undefined;
      return (
        <Card 
          {...props} 
          icon={IconComponent ? React.createElement(IconComponent as any) : undefined} 
        />
      );
    },
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
