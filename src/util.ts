export const remove = <T>(element: T, array: T[]) => array.splice(array.indexOf(element), 1);

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
