export const remove = <T>(element: T, array: T[]) => {
  const index = array.indexOf(element);
  if (index >= 0) {
    array.splice(index, 1);
    return true;
  }
  return false;
};

export const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

export const shuffle = <T>(array: T[]) => {
  const a = [...array];
  let i = array.length;
  while (i--) {
    const ri = Math.floor(Math.random() * (i + 1));
    [a[i], a[ri]] = [a[ri], a[i]];
  }
  return a;
};

export const getTopTwo = (arr: number[]) =>
  arr.reduce(
    ({ first, second }, n) => {
      if (n > first) {
        return { first: n, second: first };
      } else if (n === first) {
        return { first, second };
      } else if (n > second) {
        return { first, second: n };
      } else {
        return { first, second };
      }
    },
    {
      first: 0,
      second: 0,
    },
  );
