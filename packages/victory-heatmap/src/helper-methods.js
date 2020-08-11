import { assign, isNil, flatten, maxBy } from "lodash";
import { Helpers, LabelHelpers, Data, Domain, Scale } from "victory-core";
import { getBarPosition } from "victory-bar";
import isEqual from "react-fast-compare";
import * as d3Array from "d3-array";
import * as d3Scale from "d3-scale";
import * as d3ScaleChromatic from "d3-scale-chromatic";

const cacheLastValue = (func) => {
  let called = false;
  let lastArgs;
  let lastReturnVal;

  return (...args) => {
    if (called && isEqual(lastArgs, args)) {
      return lastReturnVal;
    }

    const value = func(...args);

    called = true;
    lastReturnVal = value;
    lastArgs = args;

    return value;
  };
};

const dataOrBinsContainDates = ({ data, bins, accessor }) => {
  const dataIsDates = data.some((datum) => accessor(datum) instanceof Date);
  const binsHasDates = Array.isArray(bins) && bins.some((bin) => bin instanceof Date);

  return dataIsDates || binsHasDates;
};

const getXBinningFunc = ({ data, x, bins, dataOrBinsContainsDates }) => {
  const xAccessor = Helpers.createAccessor(x || "x");
  const bin = d3Array.bin().value(xAccessor);

  const niceScale = (dataOrBinsContainsDates ? d3Scale.scaleTime() : d3Scale.scaleLinear())
    .domain(d3Array.extent(data, xAccessor))
    .nice();

  if (Array.isArray(bins)) {
    bin.domain([bins[0], bins[bins.length - 1]]);
    bin.thresholds(bins);

    return bin;
  }

  if (Number.isInteger(bins)) {
    bin.domain(niceScale.domain());
    bin.thresholds(bins);

    return bin;
  }

  if (dataOrBinsContainsDates) {
    bin.domain(niceScale.domain());
    bin.thresholds(niceScale.ticks());

    return bin;
  }

  bin.domain(niceScale.domain());

  return bin;
};

const getYBinningFunc = ({ data, y, bins, dataOrBinsContainsDates }) => {
  const yAccessor = Helpers.createAccessor(y || "y");
  const bin = d3Array.bin().value(yAccessor);

  const niceScale = (dataOrBinsContainsDates ? d3Scale.scaleTime() : d3Scale.scaleLinear())
    .domain(d3Array.extent(data, yAccessor))
    .nice();

  if (Array.isArray(bins)) {
    bin.domain([bins[0], bins[bins.length - 1]]);
    bin.thresholds(bins);

    return bin;
  }

  if (Number.isInteger(bins)) {
    bin.domain(niceScale.domain());
    bin.thresholds(bins);

    return bin;
  }

  if (dataOrBinsContainsDates) {
    bin.domain(niceScale.domain());
    bin.thresholds(niceScale.ticks());

    return bin;
  }

  bin.domain(niceScale.domain());

  return bin;
};

export const getFormattedData = cacheLastValue(({ data = [], x, bins }) => {
  if ((!data || !data.length) && !Array.isArray(bins)) {
    return [];
  }
  const accessor = Helpers.createAccessor(x || "x");
  // const yAccessor = Helpers.createAccessor(y || "y");
  const dataOrBinsContainsDates = dataOrBinsContainDates({ data, bins, accessor });
  const binFunc = getXBinningFunc({ data, x, bins, dataOrBinsContainsDates });
  const rawBinnedData = binFunc(data);
  const binnedData = rawBinnedData.filter(({ x0, x1 }) => {
    if (dataOrBinsContainsDates) {
      return new Date(x0).getTime() !== new Date(x1).getTime();
    }

    return x0 !== x1;
  });

  // const yDataOrBinsContainsDates = dataOrBinsContainDates({ data, bins, yAccessor });
  const yDataOrBinsContainsDates = false;
  const yBinFunc = getYBinningFunc({ data, x, bins, yDataOrBinsContainsDates });

  const formattedData = binnedData.map((bin) => {
    const x0 = dataOrBinsContainsDates ? new Date(bin.x0) : bin.x0;
    const x1 = dataOrBinsContainsDates ? new Date(bin.x1) : bin.x1;

    const rawYBins = yBinFunc(bin);

    return rawYBins.map(yBin => {
      return {
        x0,
        x1,
        x: (x0 + x1) / 2,
        y0: yBin.x0,
        y: yBin.x1,
        points: yBin,
        binLength: yBin.length
      }
    })

    // return {
    //   x0,
    //   x1,
    //   x: dataOrBinsContainsDates ? new Date((x0.getTime() + x1.getTime()) / 2) : (x0 + x1) / 2,
    //   y: bin.length,
    //   binnedData: [...bin]
    // };
  });

  const result = flatten(formattedData);
  console.log(result)
  return result;
});

const getData = (props) => {
  const { bins, data, x } = props;
  const dataIsPreformatted = data.some(({ _y }) => !isNil(_y));

  const formattedData = dataIsPreformatted ? data : getFormattedData({ data, x, bins });
  return Data.getData({ ...props, data: formattedData, x: "x" });
};

const getDomain = (props, axis) => {
  const data = getData(props);

  if (!data.length) {
    return [0, 1];
  }

  if (axis === "x") {
    const firstBin = data[0];
    const lastBin = data[data.length - 1];

    return Domain.getDomainWithZero(
      { ...props, data: [{ x: firstBin.x0 }, { x: lastBin.x1 }], x: "x" },
      "x"
    );
  }

  return props.data.length ? Domain.getDomainWithZero({ ...props, data }, "y") : [0, 1];
};

const getCalculatedValues = (props) => {
  const defaultStyles = Helpers.getDefaultStyles(props, "histogram");
  const style = Helpers.getStyles(props.style, defaultStyles);
  const data = getData(props);

  const range = props.range || {
    x: Helpers.getRange(props, "x"),
    y: Helpers.getRange(props, "y")
  };

  const domain = {
    x: getDomain(props, "x"),
    y: getDomain(props, "y")
  };

  const scale = {
    x: Scale.getBaseScale(props, "x")
      .domain(domain.x)
      .range(props.horizontal ? range.y : range.x),
    y: Scale.getBaseScale(props, "y")
      .domain(domain.y)
      .range(props.horizontal ? range.x : range.y)
  };

  return { style, data, scale, domain };
};

const getBaseProps = (props, fallbackProps) => {
  const modifiedProps = Helpers.modifyProps(props, fallbackProps, "histogram");
  props = assign({}, modifiedProps, getCalculatedValues(modifiedProps));

  const {
    binSpacing,
    cornerRadius,
    data,
    domain,
    events,
    height,
    horizontal,
    padding,
    scale,
    sharedEvents,
    standalone,
    style,
    theme,
    width,
    labels,
    name,
    getPath
  } = props;
  const initialChildProps = {
    parent: {
      horizontal,
      domain,
      scale,
      width,
      height,
      data,
      standalone,
      name,
      theme,
      padding,
      style: style.parent
    }
  };

  const getDistance = (datum) => {
    const current = scale.x(datum.x0);
    const next = scale.x(datum.x1);
    return Math.abs(next - current);
  };

  const getBarWidth = (datum) => {
    if (binSpacing) {
      return getDistance(datum) - binSpacing;
    }

    return getDistance(datum);
  };

  const maxLength = maxBy(data, "binLength");

  return data.reduce((childProps, datum, index) => {
    const eventKey = !isNil(datum.eventKey) ? datum.eventKey : index;

    const { x, y, y0, x0 } = getBarPosition(props, datum);
    const barWidth = getBarWidth(datum);
    const t = datum.binLength / maxLength.binLength;
    const fill = d3ScaleChromatic.interpolateRdYlBu(t);

    const dataProps = {
      alignment: "middle",
      barWidth,
      cornerRadius,
      data,
      datum,
      horizontal,
      index,
      scale,
      style: assign({}, style.data, { fill }),
      width,
      height,
      x,
      y,
      y0,
      x0,
      getPath
    };

    childProps[eventKey] = {
      data: dataProps
    };

    const text = LabelHelpers.getText(props, datum, index);
    if ((text !== undefined && text !== null) || (labels && (events || sharedEvents))) {
      childProps[eventKey].labels = LabelHelpers.getProps(props, index);
    }

    return childProps;
  }, initialChildProps);
};

export { getData, getDomain, getBaseProps };