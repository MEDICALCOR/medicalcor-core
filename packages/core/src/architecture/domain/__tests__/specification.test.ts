/**
 * Specification Pattern Tests
 * Comprehensive tests for domain specification pattern implementation
 */

import { describe, it, expect } from 'vitest';
import {
  Specification,
  AndSpecification,
  OrSpecification,
  NotSpecification,
  TrueSpecification,
  FalseSpecification,
  EqualSpecification,
  NotEqualSpecification,
  GreaterThanSpecification,
  LessThanSpecification,
  BetweenSpecification,
  InSpecification,
  ContainsSpecification,
  DateRangeSpecification,
  SpecificationBuilder,
  allOf,
  anyOf,
  fromPredicate,
} from '../specification.js';

// ============================================================================
// TEST DATA
// ============================================================================

interface TestProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  createdAt: Date;
}

const products: TestProduct[] = [
  {
    id: 'p1',
    name: 'Laptop Pro',
    price: 1200,
    category: 'electronics',
    inStock: true,
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'p2',
    name: 'Wireless Mouse',
    price: 50,
    category: 'electronics',
    inStock: true,
    createdAt: new Date('2024-02-20'),
  },
  {
    id: 'p3',
    name: 'Desk Chair',
    price: 350,
    category: 'furniture',
    inStock: false,
    createdAt: new Date('2024-03-10'),
  },
  {
    id: 'p4',
    name: 'Monitor Stand',
    price: 75,
    category: 'furniture',
    inStock: true,
    createdAt: new Date('2024-01-05'),
  },
];

// ============================================================================
// TRUE/FALSE SPECIFICATIONS
// ============================================================================

describe('TrueSpecification', () => {
  it('should always return true', () => {
    const spec = new TrueSpecification<TestProduct>();

    expect(spec.isSatisfiedBy(products[0])).toBe(true);
    expect(spec.isSatisfiedBy(products[1])).toBe(true);
    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(4);
  });

  it('should have domain layer identifier', () => {
    const spec = new TrueSpecification<TestProduct>();
    expect(spec.__layer).toBe('domain');
  });

  it('should return 1=1 query criteria', () => {
    const spec = new TrueSpecification<TestProduct>();
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('eq');
    expect(criteria.field).toBe('1');
    expect(criteria.value).toBe('1');
  });
});

describe('FalseSpecification', () => {
  it('should always return false', () => {
    const spec = new FalseSpecification<TestProduct>();

    expect(spec.isSatisfiedBy(products[0])).toBe(false);
    expect(spec.isSatisfiedBy(products[1])).toBe(false);
    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(0);
  });

  it('should return 1=0 query criteria', () => {
    const spec = new FalseSpecification<TestProduct>();
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('eq');
    expect(criteria.field).toBe('1');
    expect(criteria.value).toBe('0');
  });
});

// ============================================================================
// EQUAL SPECIFICATION
// ============================================================================

describe('EqualSpecification', () => {
  it('should match when field equals value', () => {
    const spec = new EqualSpecification<TestProduct, string>('category', 'electronics');

    expect(spec.isSatisfiedBy(products[0])).toBe(true);
    expect(spec.isSatisfiedBy(products[1])).toBe(true);
    expect(spec.isSatisfiedBy(products[2])).toBe(false);
  });

  it('should work with boolean fields', () => {
    const spec = new EqualSpecification<TestProduct, boolean>('inStock', true);

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(3);
  });

  it('should work with number fields', () => {
    const spec = new EqualSpecification<TestProduct, number>('price', 50);

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(1);
    expect(spec.isSatisfiedBy(products[1])).toBe(true);
  });

  it('should return eq query criteria', () => {
    const spec = new EqualSpecification<TestProduct, string>('category', 'electronics');
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('eq');
    expect(criteria.field).toBe('category');
    expect(criteria.value).toBe('electronics');
  });
});

// ============================================================================
// NOT EQUAL SPECIFICATION
// ============================================================================

describe('NotEqualSpecification', () => {
  it('should match when field not equals value', () => {
    const spec = new NotEqualSpecification<TestProduct, string>('category', 'electronics');

    expect(spec.isSatisfiedBy(products[0])).toBe(false);
    expect(spec.isSatisfiedBy(products[2])).toBe(true);
    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should return ne query criteria', () => {
    const spec = new NotEqualSpecification<TestProduct, string>('category', 'electronics');
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('ne');
    expect(criteria.field).toBe('category');
    expect(criteria.value).toBe('electronics');
  });
});

// ============================================================================
// GREATER THAN SPECIFICATION
// ============================================================================

describe('GreaterThanSpecification', () => {
  it('should match when field greater than value', () => {
    const spec = new GreaterThanSpecification<TestProduct>('price', 100);

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // 1200 > 100
    expect(spec.isSatisfiedBy(products[1])).toBe(false); // 50 > 100
    expect(spec.isSatisfiedBy(products[2])).toBe(true); // 350 > 100
  });

  it('should not match equal values', () => {
    const spec = new GreaterThanSpecification<TestProduct>('price', 50);

    expect(spec.isSatisfiedBy(products[1])).toBe(false); // 50 > 50 is false
  });

  it('should return gt query criteria', () => {
    const spec = new GreaterThanSpecification<TestProduct>('price', 100);
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('gt');
    expect(criteria.field).toBe('price');
    expect(criteria.value).toBe(100);
  });
});

// ============================================================================
// LESS THAN SPECIFICATION
// ============================================================================

describe('LessThanSpecification', () => {
  it('should match when field less than value', () => {
    const spec = new LessThanSpecification<TestProduct>('price', 100);

    expect(spec.isSatisfiedBy(products[0])).toBe(false); // 1200 < 100
    expect(spec.isSatisfiedBy(products[1])).toBe(true); // 50 < 100
    expect(spec.isSatisfiedBy(products[3])).toBe(true); // 75 < 100
  });

  it('should return lt query criteria', () => {
    const spec = new LessThanSpecification<TestProduct>('price', 100);
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('lt');
    expect(criteria.field).toBe('price');
    expect(criteria.value).toBe(100);
  });
});

// ============================================================================
// BETWEEN SPECIFICATION
// ============================================================================

describe('BetweenSpecification', () => {
  it('should match values in range (inclusive)', () => {
    const spec = new BetweenSpecification<TestProduct>('price', 50, 100);

    expect(spec.isSatisfiedBy(products[0])).toBe(false); // 1200
    expect(spec.isSatisfiedBy(products[1])).toBe(true); // 50
    expect(spec.isSatisfiedBy(products[3])).toBe(true); // 75
  });

  it('should include boundary values', () => {
    const spec = new BetweenSpecification<TestProduct>('price', 50, 350);

    expect(spec.isSatisfiedBy(products[1])).toBe(true); // 50 (min)
    expect(spec.isSatisfiedBy(products[2])).toBe(true); // 350 (max)
  });

  it('should return and query criteria with gte and lte', () => {
    const spec = new BetweenSpecification<TestProduct>('price', 50, 100);
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('and');
    expect(criteria.children).toHaveLength(2);
    expect(criteria.children![0]).toEqual({ operator: 'gte', field: 'price', value: 50 });
    expect(criteria.children![1]).toEqual({ operator: 'lte', field: 'price', value: 100 });
  });
});

// ============================================================================
// IN SPECIFICATION
// ============================================================================

describe('InSpecification', () => {
  it('should match when field is in list', () => {
    const spec = new InSpecification<TestProduct, string>('id', ['p1', 'p3']);

    expect(spec.isSatisfiedBy(products[0])).toBe(true);
    expect(spec.isSatisfiedBy(products[1])).toBe(false);
    expect(spec.isSatisfiedBy(products[2])).toBe(true);
  });

  it('should return in query criteria', () => {
    const spec = new InSpecification<TestProduct, string>('category', ['electronics', 'toys']);
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('in');
    expect(criteria.field).toBe('category');
    expect(criteria.value).toEqual(['electronics', 'toys']);
  });
});

// ============================================================================
// CONTAINS SPECIFICATION
// ============================================================================

describe('ContainsSpecification', () => {
  it('should match when field contains substring', () => {
    const spec = new ContainsSpecification<TestProduct>('name', 'Pro');

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // "Laptop Pro"
    expect(spec.isSatisfiedBy(products[1])).toBe(false); // "Wireless Mouse"
  });

  it('should be case sensitive', () => {
    const spec = new ContainsSpecification<TestProduct>('name', 'pro');

    expect(spec.isSatisfiedBy(products[0])).toBe(false); // "Laptop Pro" vs "pro"
  });

  it('should handle null/undefined gracefully', () => {
    const spec = new ContainsSpecification<{ name?: string }>('name', 'test');
    const obj = { name: undefined } as unknown as { name?: string };

    expect(spec.isSatisfiedBy(obj)).toBe(false);
  });

  it('should return contains query criteria', () => {
    const spec = new ContainsSpecification<TestProduct>('name', 'Pro');
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('contains');
    expect(criteria.field).toBe('name');
    expect(criteria.value).toBe('Pro');
  });
});

// ============================================================================
// DATE RANGE SPECIFICATION
// ============================================================================

describe('DateRangeSpecification', () => {
  it('should match dates in range', () => {
    const spec = new DateRangeSpecification<TestProduct>(
      'createdAt',
      new Date('2024-01-01'),
      new Date('2024-02-01')
    );

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // 2024-01-15
    expect(spec.isSatisfiedBy(products[1])).toBe(false); // 2024-02-20
    expect(spec.isSatisfiedBy(products[3])).toBe(true); // 2024-01-05
  });

  it('should include boundary dates', () => {
    const spec = new DateRangeSpecification<TestProduct>(
      'createdAt',
      new Date('2024-01-15'),
      new Date('2024-02-20')
    );

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // equals start
    expect(spec.isSatisfiedBy(products[1])).toBe(true); // equals end
  });

  it('should return and query criteria with date strings', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-02-01');
    const spec = new DateRangeSpecification<TestProduct>('createdAt', start, end);
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('and');
    expect(criteria.children).toHaveLength(2);
    expect(criteria.children![0]).toEqual({
      operator: 'gte',
      field: 'createdAt',
      value: start.toISOString(),
    });
  });
});

// ============================================================================
// COMPOSITE SPECIFICATIONS (AND, OR, NOT)
// ============================================================================

describe('AndSpecification', () => {
  it('should require both specs to be satisfied', () => {
    const isElectronics = new EqualSpecification<TestProduct, string>('category', 'electronics');
    const isExpensive = new GreaterThanSpecification<TestProduct>('price', 100);
    const spec = new AndSpecification(isElectronics, isExpensive);

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // electronics AND > 100
    expect(spec.isSatisfiedBy(products[1])).toBe(false); // electronics BUT <= 100
  });

  it('should short-circuit on first false', () => {
    const spec = new AndSpecification(new FalseSpecification(), new TrueSpecification());

    expect(spec.isSatisfiedBy(products[0])).toBe(false);
  });

  it('should return and query criteria', () => {
    const spec = new AndSpecification(
      new EqualSpecification<TestProduct, string>('category', 'electronics'),
      new GreaterThanSpecification<TestProduct>('price', 100)
    );
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('and');
    expect(criteria.children).toHaveLength(2);
  });
});

describe('OrSpecification', () => {
  it('should match if either spec is satisfied', () => {
    const isElectronics = new EqualSpecification<TestProduct, string>('category', 'electronics');
    const isCheap = new LessThanSpecification<TestProduct>('price', 100);
    const spec = new OrSpecification(isElectronics, isCheap);

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // electronics
    expect(spec.isSatisfiedBy(products[2])).toBe(false); // furniture AND expensive
    expect(spec.isSatisfiedBy(products[3])).toBe(true); // cheap
  });

  it('should return or query criteria', () => {
    const spec = new OrSpecification(
      new EqualSpecification<TestProduct, string>('category', 'electronics'),
      new LessThanSpecification<TestProduct>('price', 100)
    );
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('or');
    expect(criteria.children).toHaveLength(2);
  });
});

describe('NotSpecification', () => {
  it('should negate the inner spec', () => {
    const isElectronics = new EqualSpecification<TestProduct, string>('category', 'electronics');
    const spec = new NotSpecification(isElectronics);

    expect(spec.isSatisfiedBy(products[0])).toBe(false); // is electronics
    expect(spec.isSatisfiedBy(products[2])).toBe(true); // not electronics
  });

  it('should return not query criteria', () => {
    const spec = new NotSpecification(
      new EqualSpecification<TestProduct, string>('category', 'electronics')
    );
    const criteria = spec.toQueryCriteria();

    expect(criteria.operator).toBe('not');
    expect(criteria.children).toHaveLength(1);
  });
});

// ============================================================================
// SPECIFICATION CHAINING
// ============================================================================

describe('Specification chaining', () => {
  it('should chain with and()', () => {
    const spec = new EqualSpecification<TestProduct, string>('category', 'electronics')
      .and(new EqualSpecification<TestProduct, boolean>('inStock', true))
      .and(new GreaterThanSpecification<TestProduct>('price', 100));

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // all conditions met
    expect(spec.isSatisfiedBy(products[1])).toBe(false); // price not > 100
  });

  it('should chain with or()', () => {
    const spec = new EqualSpecification<TestProduct, string>('category', 'electronics').or(
      new EqualSpecification<TestProduct, string>('category', 'furniture')
    );

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(4);
  });

  it('should chain with not()', () => {
    const spec = new EqualSpecification<TestProduct, string>('category', 'electronics').not();

    expect(spec.isSatisfiedBy(products[0])).toBe(false);
    expect(spec.isSatisfiedBy(products[2])).toBe(true);
  });

  it('should handle complex chains', () => {
    const spec = new EqualSpecification<TestProduct, string>('category', 'electronics')
      .and(new GreaterThanSpecification<TestProduct>('price', 100))
      .or(
        new EqualSpecification<TestProduct, string>('category', 'furniture').and(
          new EqualSpecification<TestProduct, boolean>('inStock', true)
        )
      );

    expect(spec.isSatisfiedBy(products[0])).toBe(true); // electronics > 100
    expect(spec.isSatisfiedBy(products[1])).toBe(false); // electronics <= 100
    expect(spec.isSatisfiedBy(products[2])).toBe(false); // furniture but not in stock
    expect(spec.isSatisfiedBy(products[3])).toBe(true); // furniture and in stock
  });
});

// ============================================================================
// SPECIFICATION BUILDER
// ============================================================================

describe('SpecificationBuilder', () => {
  it('should build with equals', () => {
    const spec = new SpecificationBuilder<TestProduct>()
      .where('category')
      .equals('electronics')
      .build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should build with notEquals', () => {
    const spec = new SpecificationBuilder<TestProduct>()
      .where('category')
      .notEquals('electronics')
      .build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should build with greaterThan', () => {
    const spec = new SpecificationBuilder<TestProduct>().where('price').greaterThan(100).build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should build with lessThan', () => {
    const spec = new SpecificationBuilder<TestProduct>().where('price').lessThan(100).build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should build with between', () => {
    const spec = new SpecificationBuilder<TestProduct>().where('price').between(50, 100).build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should build with in', () => {
    const spec = new SpecificationBuilder<TestProduct>().where('id').in(['p1', 'p2']).build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should build with contains', () => {
    const spec = new SpecificationBuilder<TestProduct>().where('name').contains('Desk').build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(1);
  });

  it('should build with inDateRange', () => {
    const spec = new SpecificationBuilder<TestProduct>()
      .where('createdAt')
      .inDateRange(new Date('2024-01-01'), new Date('2024-02-01'))
      .build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });

  it('should chain multiple conditions', () => {
    const spec = new SpecificationBuilder<TestProduct>()
      .where('category')
      .equals('electronics')
      .where('price')
      .greaterThan(100)
      .build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(1);
  });

  it('should support orSpec', () => {
    const spec = new SpecificationBuilder<TestProduct>()
      .where('category')
      .equals('electronics')
      .orSpec(new EqualSpecification<TestProduct, string>('category', 'furniture'))
      .build();

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(4);
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('allOf', () => {
  it('should return TrueSpecification for empty array', () => {
    const spec = allOf<TestProduct>();

    expect(spec.isSatisfiedBy(products[0])).toBe(true);
  });

  it('should combine all specs with AND', () => {
    const spec = allOf(
      new EqualSpecification<TestProduct, string>('category', 'electronics'),
      new EqualSpecification<TestProduct, boolean>('inStock', true),
      new GreaterThanSpecification<TestProduct>('price', 100)
    );

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(1);
  });
});

describe('anyOf', () => {
  it('should return FalseSpecification for empty array', () => {
    const spec = anyOf<TestProduct>();

    expect(spec.isSatisfiedBy(products[0])).toBe(false);
  });

  it('should combine all specs with OR', () => {
    const spec = anyOf(
      new EqualSpecification<TestProduct, string>('id', 'p1'),
      new EqualSpecification<TestProduct, string>('id', 'p3')
    );

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(2);
  });
});

describe('fromPredicate', () => {
  it('should create specification from predicate function', () => {
    const spec = fromPredicate<TestProduct>((p) => p.price > 100 && p.inStock, {
      operator: 'custom',
      field: 'custom',
      value: 'custom',
    });

    expect(products.filter((p) => spec.isSatisfiedBy(p))).toHaveLength(1);
    expect(spec.isSatisfiedBy(products[0])).toBe(true); // 1200, in stock
    expect(spec.isSatisfiedBy(products[2])).toBe(false); // 350, not in stock
  });

  it('should return provided query criteria', () => {
    const customCriteria = { operator: 'custom' as const, field: 'test', value: 123 };
    const spec = fromPredicate<TestProduct>(() => true, customCriteria);

    expect(spec.toQueryCriteria()).toEqual(customCriteria);
  });
});
